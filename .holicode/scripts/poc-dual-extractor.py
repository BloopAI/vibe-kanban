#!/usr/bin/env python3
"""
HOL-187 PoC: Dual-runtime skeleton extractor (Python)

Validates that a single Python script can process both:
- Claude Code JSONL sessions (~/.claude/projects/{path}/{uuid}.jsonl)
- OpenCode SQLite sessions (~/.local/share/opencode/opencode.db)

Outputs unified SessionSkeleton YAML for both runtimes.

Usage: python3 scripts/poc-dual-extractor.py
"""

import json
import os
import sqlite3
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import yaml

# ─── Types ────────────────────────────────────────────────────────

Runtime = Literal["claude_code", "opencode"]

ToolCategory = Literal[
    "file_read", "file_write", "search", "shell",
    "mcp_board", "mcp_workspace", "subagent", "progress", "skill", "other",
]

Archetype = Literal[
    "quick_admin", "implementation", "planning", "orchestrator", "spike", "unknown",
]


@dataclass
class ToolEvent:
    ts: str          # ISO8601
    turn: int
    tool: str        # normalized name
    cat: ToolCategory
    is_parallel: bool
    is_subagent: bool


@dataclass
class SessionEvent:
    session_id: str
    runtime: Runtime
    branch: str | None
    archetype: Archetype
    agent_setting: str | None
    started_at: str
    ended_at: str
    duration_minutes: float
    user_turns: int
    total_tool_calls: int
    compaction_count: int
    subagent_count: int
    workspace_dispatches: int
    model: str
    file_size_bytes: int
    pr_urls: list[str] = field(default_factory=list)


@dataclass
class SessionSkeleton:
    session: SessionEvent
    tools: list[ToolEvent]
    tool_summary: dict[str, int]


# ─── Tool name normalization ─────────────────────────────────────

TOOL_ALIASES: dict[str, str] = {
    "bash": "Bash",
    "read": "Read",
    "write": "Write",
    "edit": "Edit",
    "glob": "Glob",
    "grep": "Grep",
    "fetch": "WebFetch",
}


def normalize_tool_name(name: str, runtime: Runtime) -> str:
    if runtime == "opencode":
        return TOOL_ALIASES.get(name, name)
    return name


# ─── Tool categorization ─────────────────────────────────────────

TOOL_CATEGORIES: dict[str, ToolCategory] = {
    "Read": "file_read",
    "Glob": "search",
    "Grep": "search",
    "Edit": "file_write",
    "Write": "file_write",
    "NotebookEdit": "file_write",
    "Bash": "shell",
    "Task": "subagent",
    "TaskOutput": "subagent",
    "TaskStop": "subagent",
    "TodoWrite": "progress",
    "Skill": "skill",
    "WebFetch": "other",
    "WebSearch": "other",
    "EnterPlanMode": "other",
    "ExitPlanMode": "other",
}

MCP_WORKSPACE_SUFFIXES = {
    "start_workspace_session", "list_workspaces", "delete_workspace",
    "update_workspace", "link_workspace",
}


def categorize_tool(name: str) -> ToolCategory:
    if name in TOOL_CATEGORIES:
        return TOOL_CATEGORIES[name]
    if name.startswith("mcp__vibe_kanban__"):
        suffix = name[len("mcp__vibe_kanban__"):]
        return "mcp_workspace" if suffix in MCP_WORKSPACE_SUFFIXES else "mcp_board"
    return "other"


# ─── Archetype classification ────────────────────────────────────

def classify_archetype(
    tool_counts: dict[str, int], total: int, file_size: int
) -> Archetype:
    def sum_by_cat(cat: ToolCategory) -> int:
        return sum(v for k, v in tool_counts.items() if categorize_tool(k) == cat)

    mcp_board = sum_by_cat("mcp_board")
    file_write = sum_by_cat("file_write")
    dispatches = tool_counts.get("mcp__vibe_kanban__start_workspace_session", 0)
    subagents = tool_counts.get("Task", 0) + tool_counts.get("task", 0)
    search = sum_by_cat("search")

    if file_size < 100_000 and mcp_board / max(total, 1) > 0.4:
        return "quick_admin"
    if dispatches >= 2:
        return "orchestrator"
    if file_write / max(total, 1) > 0.15:
        return "implementation"
    if subagents >= 3 or search / max(total, 1) > 0.3:
        return "spike"
    if total > 20:
        return "planning"
    return "unknown"


# ─── YAML serializer ─────────────────────────────────────────────

def skeleton_to_yaml(skeleton: SessionSkeleton) -> str:
    """Serialize skeleton to YAML using PyYAML for correct output."""
    s = skeleton.session
    data = {
        "session": {
            "session_id": s.session_id,
            "runtime": s.runtime,
            "branch": s.branch,
            "archetype": s.archetype,
            "agent_setting": s.agent_setting,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "duration_minutes": round(s.duration_minutes, 1),
            "user_turns": s.user_turns,
            "total_tool_calls": s.total_tool_calls,
            "compaction_count": s.compaction_count,
            "subagent_count": s.subagent_count,
            "workspace_dispatches": s.workspace_dispatches,
            "model": s.model,
            "file_size_bytes": s.file_size_bytes,
            "pr_urls": s.pr_urls,
        },
        "tools": [
            {"ts": t.ts, "turn": t.turn, "tool": t.tool, "cat": t.cat}
            for t in skeleton.tools
        ],
        "tool_summary": dict(
            sorted(skeleton.tool_summary.items(), key=lambda x: -x[1])
        ),
    }
    return yaml.dump(data, default_flow_style=False, sort_keys=False, width=120)


# ─── Claude Code Extractor ───────────────────────────────────────

def extract_claude_code(jsonl_path: str) -> SessionSkeleton | None:
    """Extract session skeleton from a Claude Code JSONL file."""
    file_size = os.path.getsize(jsonl_path)
    if file_size == 0:
        return None

    tool_events: list[ToolEvent] = []
    tool_counts: Counter[str] = Counter()
    first_ts = ""
    last_ts = ""
    user_turns = 0
    compactions = 0
    subagent_count = 0
    workspace_dispatches = 0
    model = "unknown"
    branch: str | None = None
    session_id = ""
    agent_setting: str | None = None
    pr_urls: list[str] = []

    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue

            ts = msg.get("timestamp", "")
            msg_type = msg.get("type", "")

            if not first_ts and ts:
                first_ts = ts
            if ts:
                last_ts = ts
            if not session_id and msg.get("sessionId"):
                session_id = msg["sessionId"]

            if msg_type == "queue-operation":
                if msg.get("operation") == "dequeue":
                    user_turns += 1

            elif msg_type == "agent-setting":
                if msg.get("agentSetting"):
                    agent_setting = msg["agentSetting"]

            elif msg_type == "system":
                if msg.get("subtype") == "compact_boundary":
                    compactions += 1

            elif msg_type == "pr-link":
                if msg.get("prUrl"):
                    pr_urls.append(msg["prUrl"])

            elif msg_type == "assistant":
                if not branch and msg.get("gitBranch"):
                    branch = msg["gitBranch"]
                if model == "unknown":
                    m = msg.get("message", {}).get("model")
                    if m:
                        model = m

                content = msg.get("message", {}).get("content", [])
                if not isinstance(content, list):
                    continue

                tools = [
                    c["name"] for c in content
                    if isinstance(c, dict) and c.get("type") == "tool_use"
                ]
                is_parallel = len(tools) > 1
                is_sidechain = msg.get("isSidechain", False)

                for tool_name in tools:
                    normalized = normalize_tool_name(tool_name, "claude_code")
                    tool_counts[normalized] += 1

                    if normalized == "Task":
                        subagent_count += 1
                    if normalized == "mcp__vibe_kanban__start_workspace_session":
                        workspace_dispatches += 1

                    tool_events.append(ToolEvent(
                        ts=ts,
                        turn=user_turns,
                        tool=normalized,
                        cat=categorize_tool(normalized),
                        is_parallel=is_parallel,
                        is_subagent=is_sidechain,
                    ))

    if not tool_events and user_turns == 0:
        return None

    total = sum(tool_counts.values())

    # Parse timestamps for duration
    from datetime import datetime, timezone
    try:
        start_dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
        duration_min = (end_dt - start_dt).total_seconds() / 60
    except (ValueError, AttributeError):
        start_dt = end_dt = datetime.now(timezone.utc)
        duration_min = 0.0

    return SessionSkeleton(
        session=SessionEvent(
            session_id=session_id or Path(jsonl_path).stem,
            runtime="claude_code",
            branch=branch,
            archetype=classify_archetype(dict(tool_counts), total, file_size),
            agent_setting=agent_setting,
            started_at=first_ts or start_dt.isoformat(),
            ended_at=last_ts or end_dt.isoformat(),
            duration_minutes=round(duration_min, 1),
            user_turns=user_turns,
            total_tool_calls=total,
            compaction_count=compactions,
            subagent_count=subagent_count,
            workspace_dispatches=workspace_dispatches,
            model=model,
            file_size_bytes=file_size,
            pr_urls=pr_urls,
        ),
        tools=tool_events,
        tool_summary=dict(tool_counts),
    )


# ─── OpenCode Extractor ──────────────────────────────────────────

def extract_opencode(db_path: str) -> list[SessionSkeleton]:
    """Extract session skeletons from the OpenCode SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    skeletons: list[SessionSkeleton] = []

    sessions = conn.execute(
        "SELECT id, title, directory, time_created, time_updated, time_archived "
        "FROM session ORDER BY time_created"
    ).fetchall()

    for session in sessions:
        sid = session["id"]

        messages = conn.execute(
            "SELECT id, session_id, time_created, data "
            "FROM message WHERE session_id = ? ORDER BY time_created",
            (sid,),
        ).fetchall()

        parts = conn.execute(
            "SELECT id, message_id, session_id, time_created, data "
            "FROM part WHERE session_id = ? ORDER BY time_created",
            (sid,),
        ).fetchall()

        # Extract model from messages (OpenCode puts model on user messages)
        model = "unknown"
        for m in messages:
            d = json.loads(m["data"])
            model_obj = d.get("model")
            if isinstance(model_obj, dict) and model_obj.get("modelID"):
                model = model_obj["modelID"]
                break

        # Count user turns (role=user messages)
        user_turns = 0
        for m in messages:
            d = json.loads(m["data"])
            if d.get("role") == "user":
                user_turns += 1

        # Extract tool events
        tool_events: list[ToolEvent] = []
        tool_counts: Counter[str] = Counter()
        current_turn = 0

        # Pre-parse part data for parallel detection
        parsed_parts = []
        for p in parts:
            d = json.loads(p["data"])
            parsed_parts.append((p, d))

        # Build message_id → tool count for parallel detection
        tools_per_message: Counter[str] = Counter()
        for p, d in parsed_parts:
            if d.get("type") == "tool":
                tools_per_message[p["message_id"]] += 1

        for p, d in parsed_parts:
            if d.get("type") == "step-start":
                current_turn += 1
                continue

            if d.get("type") != "tool":
                continue

            raw_tool_name = d.get("tool", "")
            normalized = normalize_tool_name(raw_tool_name, "opencode")
            tool_counts[normalized] += 1

            from datetime import datetime, timezone
            ts_ms = p["time_created"]
            ts_iso = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()

            is_parallel = tools_per_message[p["message_id"]] > 1

            tool_events.append(ToolEvent(
                ts=ts_iso,
                turn=current_turn,
                tool=normalized,
                cat=categorize_tool(normalized),
                is_parallel=is_parallel,
                is_subagent=False,  # OpenCode has no subagent concept
            ))

        total = sum(tool_counts.values())

        # Estimate "file size" as DB row data size
        data_size = sum(len(m["data"]) for m in messages) + sum(len(p["data"]) for p in parts)

        from datetime import datetime, timezone
        started_at = datetime.fromtimestamp(
            session["time_created"] / 1000, tz=timezone.utc
        ).isoformat()
        ended_at = datetime.fromtimestamp(
            session["time_updated"] / 1000, tz=timezone.utc
        ).isoformat()
        duration_min = (session["time_updated"] - session["time_created"]) / 60_000

        workspace_dispatches = tool_counts.get(
            "mcp__vibe_kanban__start_workspace_session", 0
        )

        skeletons.append(SessionSkeleton(
            session=SessionEvent(
                session_id=sid,
                runtime="opencode",
                branch=None,  # OpenCode doesn't store branch in session metadata
                archetype=classify_archetype(dict(tool_counts), total, data_size),
                agent_setting=None,  # No equivalent in OpenCode
                started_at=started_at,
                ended_at=ended_at,
                duration_minutes=round(duration_min, 1),
                user_turns=user_turns,
                total_tool_calls=total,
                compaction_count=0,  # No compaction in OpenCode
                subagent_count=0,    # No subagents in OpenCode
                workspace_dispatches=workspace_dispatches,
                model=model,
                file_size_bytes=data_size,
                pr_urls=[],  # No pr-link events in OpenCode
            ),
            tools=tool_events,
            tool_summary=dict(tool_counts),
        ))

    conn.close()
    return skeletons


# ─── Main ─────────────────────────────────────────────────────────

def main() -> None:
    print("=== HOL-187 PoC: Dual-Runtime Skeleton Extractor (Python) ===\n")

    home = Path.home()

    # ── Claude Code sessions ──
    cc_sessions = {
        "SMALL": str(home / ".claude/projects/-var-tmp-vibe-kanban-worktrees-dc24-search-for-most-holicode/653454ef-85b1-41f8-a3eb-5e59fd3a520b.jsonl"),
        "MEDIUM": str(home / ".claude/projects/-var-tmp-vibe-kanban-worktrees-9267-hol-187-poc-dual-holicode/1ed9163b-a840-4b4d-a39a-59c4eb1cf513.jsonl"),
        "LARGE": str(home / ".claude/projects/-var-tmp-vibe-kanban-worktrees-8a80-hol-180-opus-1m-holicode/92aca84e-6dd7-4b9c-a722-3c4304a42831.jsonl"),
    }

    print("── Claude Code Sessions ──\n")

    for label, path in cc_sessions.items():
        t0 = time.monotonic()
        try:
            skeleton = extract_claude_code(path)
            elapsed_ms = (time.monotonic() - t0) * 1000

            if not skeleton:
                print(f"[{label}] {Path(path).name} → skipped (empty)\n")
                continue

            s = skeleton.session
            print(f"[{label}] {s.session_id}")
            print(f"  Runtime: {s.runtime}")
            print(f"  Model: {s.model}")
            print(f"  Branch: {s.branch or 'null'}")
            print(f"  Archetype: {s.archetype}")
            print(f"  Duration: {s.duration_minutes} min")
            print(f"  User turns: {s.user_turns}")
            print(f"  Tool calls: {s.total_tool_calls}")
            print(f"  Compactions: {s.compaction_count}")
            print(f"  Subagents: {s.subagent_count}")
            print(f"  Agent setting: {s.agent_setting or 'null'}")
            print(f"  File size: {s.file_size_bytes} bytes")
            top5 = sorted(skeleton.tool_summary.items(), key=lambda x: -x[1])[:5]
            print(f"  Top tools: {', '.join(f'{k}({v})' for k, v in top5)}")
            print(f"  PR URLs: {', '.join(s.pr_urls) if s.pr_urls else 'none'}")
            print(f"  Extraction time: {elapsed_ms:.0f}ms")

            # Write YAML output
            yaml_out = skeleton_to_yaml(skeleton)
            out_path = f"/tmp/poc-py-skeleton-cc-{label.lower()}.yaml"
            Path(out_path).write_text(yaml_out)
            print(f"  → YAML written to {out_path} ({len(yaml_out)} bytes)\n")

        except Exception as e:
            print(f"[{label}] ERROR: {e}\n")

    # ── OpenCode sessions ──
    oc_db_path = str(home / ".local/share/opencode/opencode.db")
    print("── OpenCode Sessions ──\n")

    try:
        t0 = time.monotonic()
        skeletons = extract_opencode(oc_db_path)
        elapsed_ms = (time.monotonic() - t0) * 1000
        print(f"Found {len(skeletons)} OpenCode sessions (extracted in {elapsed_ms:.0f}ms)\n")

        for skeleton in skeletons:
            s = skeleton.session
            print(f"[OC] {s.session_id}")
            print(f"  Runtime: {s.runtime}")
            print(f"  Model: {s.model}")
            print(f"  Branch: {s.branch or 'null'}")
            print(f"  Archetype: {s.archetype}")
            print(f"  Duration: {s.duration_minutes} min")
            print(f"  User turns: {s.user_turns}")
            print(f"  Tool calls: {s.total_tool_calls}")
            print(f"  Compactions: {s.compaction_count}")
            print(f"  Subagents: {s.subagent_count}")
            print(f"  Agent setting: {s.agent_setting or 'null'}")
            print(f"  File size: {s.file_size_bytes} bytes (DB row data)")
            top5 = sorted(skeleton.tool_summary.items(), key=lambda x: -x[1])[:5]
            print(f"  Top tools: {', '.join(f'{k}({v})' for k, v in top5) if top5 else 'none'}")

            # Write YAML
            yaml_out = skeleton_to_yaml(skeleton)
            out_path = f"/tmp/poc-py-skeleton-oc-{s.session_id[:12]}.yaml"
            Path(out_path).write_text(yaml_out)
            print(f"  → YAML written to {out_path} ({len(yaml_out)} bytes)\n")

    except Exception as e:
        print(f"[OpenCode] ERROR: {e}\n")

    # ── Summary ──
    print("── Python-Specific Findings ──\n")
    print("1. stdlib `sqlite3`: Works perfectly for OpenCode DB reading")
    print("   - sqlite3.Row factory gives dict-like access")
    print("   - No experimental warnings (unlike node:sqlite)")
    print("   - Well-documented, mature API")
    print()
    print("2. stdlib `json`: JSONL line-by-line parsing is trivial")
    print("   - json.loads() per line, file iteration via `for line in f`")
    print("   - No streaming complexity — Python file iteration is already lazy")
    print()
    print("3. PyYAML (`yaml.dump`): Produces clean YAML output")
    print("   - Requires `pip install pyyaml` (external dependency)")
    print("   - Alternative: stdlib-only approach would need a manual serializer")
    print()
    print("4. `dataclasses`: Clean type definitions for SessionSkeleton schema")
    print("   - Similar ergonomics to TypeScript interfaces")
    print("   - `typing.Literal` for enums (no runtime enforcement)")
    print()
    print("5. `collections.Counter`: Built-in tool counting — more ergonomic than manual dict")
    print()
    print("6. `datetime.fromisoformat`: Handles CC ISO timestamps directly")
    print("   - Needs `.replace('Z', '+00:00')` workaround for trailing Z")
    print("   - OC integer timestamps → `datetime.fromtimestamp(ms/1000)` clean")


if __name__ == "__main__":
    main()
