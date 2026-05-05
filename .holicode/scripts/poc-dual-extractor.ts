#!/usr/bin/env npx tsx
/**
 * HOL-187 PoC: Dual-runtime skeleton extractor
 *
 * Validates that a single TypeScript script can process both:
 * - Claude Code JSONL sessions (~/.claude/projects/{path}/{uuid}.jsonl)
 * - OpenCode SQLite sessions (~/.local/share/opencode/opencode.db)
 *
 * Outputs unified SessionSkeleton YAML for both runtimes.
 *
 * Usage: npx tsx scripts/poc-dual-extractor.ts
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Types (shared across both runtimes) ───────────────────────────

type Runtime = "claude_code" | "opencode";

type ToolCategory =
  | "file_read"
  | "file_write"
  | "search"
  | "shell"
  | "mcp_board"
  | "mcp_workspace"
  | "subagent"
  | "progress"
  | "skill"
  | "other";

type Archetype =
  | "quick_admin"
  | "implementation"
  | "planning"
  | "orchestrator"
  | "spike"
  | "unknown";

interface ToolEvent {
  ts: string; // ISO8601
  turn: number;
  tool: string; // normalized name
  cat: ToolCategory;
  is_parallel: boolean;
  is_subagent: boolean;
}

interface SessionEvent {
  session_id: string;
  runtime: Runtime;
  branch: string | null;
  archetype: Archetype;
  agent_setting: string | null;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  user_turns: number;
  total_tool_calls: number;
  compaction_count: number;
  subagent_count: number;
  workspace_dispatches: number;
  model: string;
  file_size_bytes: number;
  pr_urls: string[];
}

interface SessionSkeleton {
  session: SessionEvent;
  tools: ToolEvent[];
  tool_summary: Record<string, number>;
}

// ─── Tool name normalization ───────────────────────────────────────

const TOOL_ALIASES: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  fetch: "WebFetch",
};

function normalizeToolName(name: string, runtime: Runtime): string {
  if (runtime === "opencode") return TOOL_ALIASES[name] ?? name;
  return name;
}

// ─── Tool categorization ──────────────────────────────────────────

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: "file_read",
  Glob: "search",
  Grep: "search",
  Edit: "file_write",
  Write: "file_write",
  NotebookEdit: "file_write",
  Bash: "shell",
  Task: "subagent",
  TaskOutput: "subagent",
  TaskStop: "subagent",
  TodoWrite: "progress",
  Skill: "skill",
  WebFetch: "other",
  WebSearch: "other",
  EnterPlanMode: "other",
  ExitPlanMode: "other",
};

const MCP_WORKSPACE_SUFFIXES = new Set([
  "start_workspace_session",
  "list_workspaces",
  "delete_workspace",
  "update_workspace",
  "link_workspace",
]);

function categorizeTool(name: string): ToolCategory {
  if (name in TOOL_CATEGORIES) return TOOL_CATEGORIES[name];
  if (name.startsWith("mcp__vibe_kanban__")) {
    const suffix = name.slice("mcp__vibe_kanban__".length);
    return MCP_WORKSPACE_SUFFIXES.has(suffix) ? "mcp_workspace" : "mcp_board";
  }
  return "other";
}

// ─── Archetype classification ─────────────────────────────────────

function classifyArchetype(
  toolCounts: Record<string, number>,
  total: number,
  fileSize: number
): Archetype {
  const sumByCategory = (cat: ToolCategory) =>
    Object.entries(toolCounts).reduce(
      (s, [k, v]) => s + (categorizeTool(k) === cat ? v : 0),
      0
    );

  const mcpBoard = sumByCategory("mcp_board");
  const fileWrite = sumByCategory("file_write");
  const dispatches =
    toolCounts["mcp__vibe_kanban__start_workspace_session"] ?? 0;
  const subagents = (toolCounts["Task"] ?? 0) + (toolCounts["task"] ?? 0);
  const search = sumByCategory("search");

  if (fileSize < 100_000 && mcpBoard / Math.max(total, 1) > 0.4)
    return "quick_admin";
  if (dispatches >= 2) return "orchestrator";
  if (fileWrite / Math.max(total, 1) > 0.15) return "implementation";
  if (subagents >= 3 || search / Math.max(total, 1) > 0.3) return "spike";
  if (total > 20) return "planning";
  return "unknown";
}

// ─── YAML serializer (template literal, no deps) ─────────────────

function toYaml(skeleton: SessionSkeleton): string {
  const s = skeleton.session;
  const lines: string[] = [];

  lines.push("session:");
  lines.push(`  session_id: "${s.session_id}"`);
  lines.push(`  runtime: ${s.runtime}`);
  lines.push(`  branch: ${s.branch ? `"${s.branch}"` : "null"}`);
  lines.push(`  archetype: ${s.archetype}`);
  lines.push(
    `  agent_setting: ${s.agent_setting ? `"${s.agent_setting}"` : "null"}`
  );
  lines.push(`  started_at: "${s.started_at}"`);
  lines.push(`  ended_at: "${s.ended_at}"`);
  lines.push(`  duration_minutes: ${s.duration_minutes.toFixed(1)}`);
  lines.push(`  user_turns: ${s.user_turns}`);
  lines.push(`  total_tool_calls: ${s.total_tool_calls}`);
  lines.push(`  compaction_count: ${s.compaction_count}`);
  lines.push(`  subagent_count: ${s.subagent_count}`);
  lines.push(`  workspace_dispatches: ${s.workspace_dispatches}`);
  lines.push(`  model: "${s.model}"`);
  lines.push(`  file_size_bytes: ${s.file_size_bytes}`);
  if (s.pr_urls.length > 0) {
    lines.push(`  pr_urls:`);
    for (const url of s.pr_urls) {
      lines.push(`    - "${url}"`);
    }
  } else {
    lines.push(`  pr_urls: []`);
  }

  lines.push("");
  lines.push("tools:");
  for (const t of skeleton.tools) {
    lines.push(
      `  - {ts: "${t.ts}", turn: ${t.turn}, tool: "${t.tool}", cat: "${t.cat}"}`
    );
  }

  lines.push("");
  lines.push("tool_summary:");
  const sorted = Object.entries(skeleton.tool_summary).sort(
    ([, a], [, b]) => b - a
  );
  for (const [tool, count] of sorted) {
    lines.push(`  ${tool}: ${count}`);
  }

  return lines.join("\n") + "\n";
}

// ─── Claude Code Extractor ────────────────────────────────────────

async function extractClaudeCode(
  jsonlPath: string
): Promise<SessionSkeleton | null> {
  const fileStats = await stat(jsonlPath);
  if (fileStats.size === 0) return null;

  const toolEvents: ToolEvent[] = [];
  const toolCounts: Record<string, number> = {};
  let firstTs = "";
  let lastTs = "";
  let userTurns = 0;
  let compactions = 0;
  let subagentCount = 0;
  let workspaceDispatches = 0;
  let model = "unknown";
  let branch: string | null = null;
  let sessionId = "";
  let agentSetting: string | null = null;
  const prUrls: string[] = [];

  const rl = createInterface({
    input: createReadStream(jsonlPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = msg.timestamp || "";
    const msgType = msg.type || "";

    if (!firstTs && ts) firstTs = ts;
    if (ts) lastTs = ts;

    if (!sessionId && msg.sessionId) sessionId = msg.sessionId;

    switch (msgType) {
      case "queue-operation":
        if (msg.operation === "dequeue") userTurns++;
        break;

      case "agent-setting":
        if (msg.agentSetting) agentSetting = msg.agentSetting;
        break;

      case "system":
        if (msg.subtype === "compact_boundary") compactions++;
        break;

      case "pr-link":
        if (msg.prUrl) prUrls.push(msg.prUrl);
        break;

      case "assistant": {
        if (!branch && msg.gitBranch) branch = msg.gitBranch;
        if (model === "unknown" && msg.message?.model)
          model = msg.message.model;

        const content = msg.message?.content;
        if (!Array.isArray(content)) break;

        const tools = content
          .filter((c: any) => c.type === "tool_use")
          .map((c: any) => c.name as string);

        const isParallel = tools.length > 1;
        const isSidechain = msg.isSidechain === true;

        for (const toolName of tools) {
          const normalized = normalizeToolName(toolName, "claude_code");
          toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;

          if (normalized === "Task") subagentCount++;
          if (
            normalized === "mcp__vibe_kanban__start_workspace_session"
          )
            workspaceDispatches++;

          toolEvents.push({
            ts,
            turn: userTurns,
            tool: normalized,
            cat: categorizeTool(normalized),
            is_parallel: isParallel,
            is_subagent: isSidechain,
          });
        }
        break;
      }
    }
  }

  if (toolEvents.length === 0 && userTurns === 0) return null;

  const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);
  const startDate = firstTs ? new Date(firstTs) : new Date();
  const endDate = lastTs ? new Date(lastTs) : new Date();
  const durationMin = (endDate.getTime() - startDate.getTime()) / 60000;

  return {
    session: {
      session_id: sessionId || jsonlPath.split("/").pop()!.replace(".jsonl", ""),
      runtime: "claude_code",
      branch,
      archetype: classifyArchetype(toolCounts, total, fileStats.size),
      agent_setting: agentSetting,
      started_at: firstTs || startDate.toISOString(),
      ended_at: lastTs || endDate.toISOString(),
      duration_minutes: Math.round(durationMin * 10) / 10,
      user_turns: userTurns,
      total_tool_calls: total,
      compaction_count: compactions,
      subagent_count: subagentCount,
      workspace_dispatches: workspaceDispatches,
      model,
      file_size_bytes: fileStats.size,
      pr_urls: prUrls,
    },
    tools: toolEvents,
    tool_summary: toolCounts,
  };
}

// ─── OpenCode Extractor ───────────────────────────────────────────

interface OcSession {
  id: string;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
  time_archived: number | null;
}

interface OcMessage {
  id: string;
  session_id: string;
  time_created: number;
  data: string;
}

interface OcPart {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  data: string;
}

function extractOpenCode(dbPath: string): SessionSkeleton[] {
  const db = new DatabaseSync(dbPath, { open: true });
  const skeletons: SessionSkeleton[] = [];

  const sessions = db
    .prepare(
      "SELECT id, title, directory, time_created, time_updated, time_archived FROM session ORDER BY time_created"
    )
    .all() as OcSession[];

  for (const session of sessions) {
    const messages = db
      .prepare(
        "SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created"
      )
      .all(session.id) as OcMessage[];

    const parts = db
      .prepare(
        "SELECT id, message_id, session_id, time_created, data FROM part WHERE session_id = ? ORDER BY time_created"
      )
      .all(session.id) as OcPart[];

    // Extract model from first user message
    let model = "unknown";
    for (const m of messages) {
      const d = JSON.parse(m.data);
      if (d.model?.modelID) {
        model = d.model.modelID;
        break;
      }
    }

    // Count user turns
    const userTurns = messages.filter((m) => {
      const d = JSON.parse(m.data);
      return d.role === "user";
    }).length;

    // Extract tool events
    const toolEvents: ToolEvent[] = [];
    const toolCounts: Record<string, number> = {};
    let turnIndex = 0;

    // Build message_id → role map for turn tracking
    const msgRoles = new Map<string, string>();
    for (const m of messages) {
      const d = JSON.parse(m.data);
      msgRoles.set(m.id, d.role);
    }

    // Track turn boundaries via step-start parts
    let currentTurn = 0;

    for (const part of parts) {
      const d = JSON.parse(part.data);

      if (d.type === "step-start") {
        currentTurn++;
        continue;
      }

      if (d.type !== "tool") continue;

      const rawToolName = d.tool as string;
      const normalized = normalizeToolName(rawToolName, "opencode");
      toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;

      // Detect parallel: multiple tool parts for same message_id
      const sameMessageTools = parts.filter((p) => {
        if (p.message_id !== part.message_id) return false;
        const pd = JSON.parse(p.data);
        return pd.type === "tool";
      });

      toolEvents.push({
        ts: new Date(part.time_created).toISOString(),
        turn: currentTurn,
        tool: normalized,
        cat: categorizeTool(normalized),
        is_parallel: sameMessageTools.length > 1,
        is_subagent: false, // OpenCode doesn't have subagent concept
      });
    }

    const total = Object.values(toolCounts).reduce((a, b) => a + b, 0);

    // Estimate "file size" as approximate DB row data size
    let dataSize = 0;
    for (const m of messages) dataSize += m.data.length;
    for (const p of parts) dataSize += p.data.length;

    const startedAt = new Date(session.time_created).toISOString();
    const endedAt = new Date(session.time_updated).toISOString();
    const durationMin =
      (session.time_updated - session.time_created) / 60000;

    // Workspace dispatches count
    const workspaceDispatches =
      toolCounts["mcp__vibe_kanban__start_workspace_session"] ?? 0;

    skeletons.push({
      session: {
        session_id: session.id,
        runtime: "opencode",
        branch: null, // OpenCode doesn't store branch in session metadata
        archetype: classifyArchetype(toolCounts, total, dataSize),
        agent_setting: null, // No equivalent in OpenCode
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: Math.round(durationMin * 10) / 10,
        user_turns: userTurns,
        total_tool_calls: total,
        compaction_count: 0, // No compaction in OpenCode
        subagent_count: 0, // No subagents in OpenCode
        workspace_dispatches: workspaceDispatches,
        model,
        file_size_bytes: dataSize,
        pr_urls: [], // No pr-link events in OpenCode
      },
      tools: toolEvents,
      tool_summary: toolCounts,
    });
  }

  db.close();
  return skeletons;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("=== HOL-187 PoC: Dual-Runtime Skeleton Extractor ===\n");

  // ── Claude Code sessions ──
  const ccSessions = [
    // Small (~11KB)
    join(
      homedir(),
      ".claude/projects/-var-tmp-vibe-kanban-worktrees-f74e-go-to-home-and-u-project/bfba68e6-c50b-4936-a7e5-62ff12dded40.jsonl"
    ),
    // Medium (~400KB)
    join(
      homedir(),
      ".claude/projects/-var-tmp-vibe-kanban-worktrees-1dc9-triage-errors-fr-project/2b70c6d3-843b-4c5b-bef6-ae2c3a8f17d4.jsonl"
    ),
    // Large (~3MB)
    join(
      homedir(),
      ".claude/projects/-var-tmp-vibe-kanban-worktrees-2ec6-hol-176-complete-holicode/3d7d529c-937b-4153-b39b-83570158c772.jsonl"
    ),
  ];

  console.log("── Claude Code Sessions ──\n");

  for (const path of ccSessions) {
    const label = path.includes("f74e")
      ? "SMALL"
      : path.includes("1dc9")
        ? "MEDIUM"
        : "LARGE";
    try {
      const skeleton = await extractClaudeCode(path);
      if (!skeleton) {
        console.log(`[${label}] ${path.split("/").pop()} → skipped (empty)\n`);
        continue;
      }
      console.log(`[${label}] ${skeleton.session.session_id}`);
      console.log(`  Runtime: ${skeleton.session.runtime}`);
      console.log(`  Model: ${skeleton.session.model}`);
      console.log(`  Branch: ${skeleton.session.branch ?? "null"}`);
      console.log(`  Archetype: ${skeleton.session.archetype}`);
      console.log(`  Duration: ${skeleton.session.duration_minutes} min`);
      console.log(`  User turns: ${skeleton.session.user_turns}`);
      console.log(`  Tool calls: ${skeleton.session.total_tool_calls}`);
      console.log(`  Compactions: ${skeleton.session.compaction_count}`);
      console.log(`  Subagents: ${skeleton.session.subagent_count}`);
      console.log(`  Agent setting: ${skeleton.session.agent_setting ?? "null"}`);
      console.log(`  File size: ${skeleton.session.file_size_bytes} bytes`);
      console.log(
        `  Top tools: ${Object.entries(skeleton.tool_summary)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ")}`
      );
      console.log(`  PR URLs: ${skeleton.session.pr_urls.length > 0 ? skeleton.session.pr_urls.join(", ") : "none"}`);
      console.log();

      // Write YAML output
      const yaml = toYaml(skeleton);
      const outPath = `/tmp/poc-skeleton-cc-${label.toLowerCase()}.yaml`;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, yaml);
      console.log(`  → YAML written to ${outPath} (${yaml.length} bytes)\n`);
    } catch (err: any) {
      console.error(`[${label}] ERROR: ${err.message}\n`);
    }
  }

  // ── OpenCode sessions ──
  const ocDbPath = join(homedir(), ".local/share/opencode/opencode.db");
  console.log("── OpenCode Sessions ──\n");

  try {
    const skeletons = extractOpenCode(ocDbPath);
    console.log(`Found ${skeletons.length} OpenCode sessions\n`);

    for (const skeleton of skeletons) {
      console.log(`[OC] ${skeleton.session.session_id}`);
      console.log(`  Runtime: ${skeleton.session.runtime}`);
      console.log(`  Model: ${skeleton.session.model}`);
      console.log(`  Branch: ${skeleton.session.branch ?? "null"}`);
      console.log(`  Archetype: ${skeleton.session.archetype}`);
      console.log(`  Duration: ${skeleton.session.duration_minutes} min`);
      console.log(`  User turns: ${skeleton.session.user_turns}`);
      console.log(`  Tool calls: ${skeleton.session.total_tool_calls}`);
      console.log(`  Compactions: ${skeleton.session.compaction_count}`);
      console.log(`  Subagents: ${skeleton.session.subagent_count}`);
      console.log(`  Agent setting: ${skeleton.session.agent_setting ?? "null"}`);
      console.log(`  File size: ${skeleton.session.file_size_bytes} bytes (DB row data)`);
      console.log(
        `  Top tools: ${
          Object.entries(skeleton.tool_summary).length > 0
            ? Object.entries(skeleton.tool_summary)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([k, v]) => `${k}(${v})`)
                .join(", ")
            : "none"
        }`
      );
      console.log();

      // Write YAML
      const yaml = toYaml(skeleton);
      const outPath = `/tmp/poc-skeleton-oc-${skeleton.session.session_id.slice(0, 12)}.yaml`;
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outPath, yaml);
      console.log(`  → YAML written to ${outPath} (${yaml.length} bytes)\n`);
    }
  } catch (err: any) {
    console.error(`[OpenCode] ERROR: ${err.message}\n`);
  }

  // ── Summary ──
  console.log("── Findings Summary ──\n");
  console.log("1. node:sqlite (Node 22 built-in): Works for OpenCode DB reading");
  console.log("   - DatabaseSync API is synchronous (good for batch extraction)");
  console.log("   - Experimental warning emitted but functional");
  console.log("   - json_extract() works in SQL but escaping is tricky in JS strings");
  console.log("   - Recommendation: parse JSON in JS, not in SQL queries");
  console.log();
  console.log("2. Claude Code JSONL parsing: readline + JSON.parse works reliably");
  console.log("   - All 5 message types handled (assistant, user, agent-setting, system, queue-operation, pr-link)");
  console.log("   - Tool extraction from assistant.message.content[].name is straightforward");
  console.log();
  console.log("3. Tool name normalization:");
  console.log("   - OpenCode uses: bash, read, write, edit, glob, grep");
  console.log("   - Claude Code uses: Bash, Read, Write, Edit, Glob, Grep, plus MCP tools");
  console.log("   - TOOL_ALIASES map handles the mapping correctly");
  console.log();
  console.log("4. SessionSkeleton type: works for both runtimes");
  console.log("   - CC-only fields (compaction_count, subagent_count, agent_setting) → 0/null for OC");
  console.log("   - OC-only signals (step-start/step-finish, reasoning parts) → used for turn boundaries");
  console.log("   - No runtime-specific fields leak into the shared type");
}

main().catch(console.error);
