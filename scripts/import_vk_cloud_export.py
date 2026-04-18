#!/usr/bin/env python3
import argparse
import csv
import hashlib
import io
import re
import sqlite3
import sys
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

ISSUE_MARKER_RE = re.compile(r"Original Cloud Issue ID:\s*(ART-\d+)")

@dataclass
class ImportStats:
    projects_created: int = 0
    projects_updated: int = 0
    repos_created: int = 0
    project_repo_links_created: int = 0
    tasks_created: int = 0
    tasks_updated: int = 0
    attachments_created: int = 0
    task_attachment_links_created: int = 0


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def parse_ts(value: str | None) -> str | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def map_status(value: str) -> str:
    value = (value or "").strip().lower()
    return {
        "to do": "todo",
        "in progress": "inprogress",
        "in review": "inreview",
        "in staging": "inreview",
        "done": "done",
        "cancelled": "cancelled",
    }.get(value, "todo")


def sanitize_filename(name: str) -> str:
    path = Path(name)
    stem = path.stem or "file"
    clean = "".join(c for c in stem.lower().replace(" ", "_") if c.isalnum() or c == "_")
    clean = clean[:50] if len(clean) > 50 else clean
    if not clean:
        clean = "file"
    suffix = path.suffix.lower() or ".bin"
    return f"{clean}{suffix}"


def render_description(issue: dict[str, str]) -> str | None:
    body = (issue.get("Description") or "").strip()
    parts: list[str] = []
    if body:
        parts.append(body)
    metadata = [
        "Imported from Vibe Kanban cloud export.",
        "",
        "Cloud metadata",
        f"- Original Cloud Issue ID: {issue['Issue ID']}",
        f"- Original Status: {issue.get('Status') or 'Unknown'}",
        f"- Original Priority: {issue.get('Priority') or 'None'}",
        f"- Original Project: {issue.get('Project') or ''}",
        f"- Original Assignee(s): {issue.get('Assignee(s)') or 'None'}",
        f"- Original Creator: {issue.get('Creator') or 'Unknown'}",
        f"- Original Created: {issue.get('Created') or ''}",
        f"- Original Updated: {issue.get('Updated') or ''}",
    ]
    if issue.get("Parent Issue"):
        metadata.append(f"- Parent Issue: {issue['Parent Issue']}")
    parts.append("\n".join(metadata))
    return "\n\n".join(part for part in parts if part).strip() or None


def title_with_issue_id(issue_id: str, title: str) -> str:
    prefix = f"{issue_id} · "
    return title if title.startswith(prefix) else f"{prefix}{title}"


def fetch_rows_from_zip(zf: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    data = zf.read(name).decode("utf-8")
    return list(csv.DictReader(io.StringIO(data)))


def ensure_repo(conn: sqlite3.Connection, project_name: str, repo_map: dict[str, bytes], stats: ImportStats) -> bytes | None:
    candidates = {
        "foxtrot-lima": "/home/mcp/code/FoxtrotLima",
        "intake-shield": "/home/mcp/code/intakeShield",
        "ops-playbook": "/home/mcp/code/ops-playbook",
        "caspian-app": "/home/mcp/code/caspian-app",
        "caspian-ova-dashboard": "/home/mcp/code/caspian-ova-dashboard",
        "hyroxready-app": "/home/mcp/code/hyroxready-app",
        "vibe-kanban-orchestrator": "/home/mcp/code/vibe-kanban-orchestrator",
        "vibe-kanban": "/home/mcp/_vibe_kanban_repo",
    }
    wanted_path = candidates.get(project_name)
    if not wanted_path or not Path(wanted_path).exists():
        return None

    key = normalize_key(project_name)
    if key in repo_map:
        return repo_map[key]

    repo_id = uuid.uuid4()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    basename = Path(wanted_path).name
    conn.execute(
        """
        INSERT INTO repos (id, path, name, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (repo_id.bytes, wanted_path, basename, basename, now, now),
    )
    repo_map[key] = repo_id.bytes
    repo_map[normalize_key(basename)] = repo_id.bytes
    stats.repos_created += 1
    return repo_id.bytes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--zip", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    db_path = Path(args.db)
    zip_path = Path(args.zip)
    cache_dir = Path("/home/mcp/.cache/utils/attachments")
    cache_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    with zipfile.ZipFile(zip_path) as zf:
        project_rows = fetch_rows_from_zip(zf, "projects.csv")
        issue_rows = fetch_rows_from_zip(zf, "issues.csv")
        attachment_rows = fetch_rows_from_zip(zf, "attachments.csv")

        existing_projects: dict[str, sqlite3.Row] = {}
        for row in conn.execute("SELECT id, name, remote_project_id, default_agent_working_dir FROM projects"):
            existing_projects[normalize_key(row["name"])] = row

        repo_map: dict[str, bytes] = {}
        for row in conn.execute("SELECT id, name, display_name, path FROM repos"):
            repo_id = row["id"]
            repo_map[normalize_key(row["name"])] = repo_id
            repo_map[normalize_key(row["display_name"])] = repo_id
            repo_map[normalize_key(Path(row["path"]).name)] = repo_id

        existing_links = {(row["project_id"], row["repo_id"]) for row in conn.execute("SELECT project_id, repo_id FROM project_repos")}

        existing_issue_tasks: dict[str, bytes] = {}
        for row in conn.execute("SELECT id, description FROM tasks"):
            desc = row["description"] or ""
            match = ISSUE_MARKER_RE.search(desc)
            if match:
                existing_issue_tasks[match.group(1)] = row["id"]

        project_id_by_name: dict[str, bytes] = {}
        stats = ImportStats()

        for project in project_rows:
            name = project["Name"]
            key = normalize_key(name)
            created = parse_ts(project.get("Created")) or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            updated = parse_ts(project.get("Updated")) or created
            repo_id = ensure_repo(conn, name, repo_map, stats)
            default_dir = None
            if repo_id:
                repo_row = conn.execute("SELECT path FROM repos WHERE id = ?", (repo_id,)).fetchone()
                default_dir = repo_row["path"] if repo_row else None

            if key in existing_projects:
                project_row = existing_projects[key]
                project_id = project_row["id"]
                conn.execute(
                    """
                    UPDATE projects
                    SET remote_project_id = NULL,
                        updated_at = ?,
                        default_agent_working_dir = COALESCE(NULLIF(default_agent_working_dir, ''), ?)
                    WHERE id = ?
                    """,
                    (updated, default_dir or "", project_id),
                )
                stats.projects_updated += 1
            else:
                project_id = uuid.uuid4().bytes
                conn.execute(
                    """
                    INSERT INTO projects (id, name, remote_project_id, created_at, updated_at, default_agent_working_dir)
                    VALUES (?, ?, NULL, ?, ?, ?)
                    """,
                    (project_id, name, created, updated, default_dir or ""),
                )
                stats.projects_created += 1
                existing_projects[key] = conn.execute(
                    "SELECT id, name, remote_project_id, default_agent_working_dir FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()

            project_id_by_name[name] = project_id

            if repo_id and (project_id, repo_id) not in existing_links:
                conn.execute(
                    "INSERT INTO project_repos (id, project_id, repo_id) VALUES (?, ?, ?)",
                    (uuid.uuid4().bytes, project_id, repo_id),
                )
                existing_links.add((project_id, repo_id))
                stats.project_repo_links_created += 1

        attachment_rows_by_issue: dict[str, list[dict[str, str]]] = {}
        for row in attachment_rows:
            attachment_rows_by_issue.setdefault(row["Issue ID"], []).append(row)

        for issue in issue_rows:
            issue_id = issue["Issue ID"]
            project_id = project_id_by_name[issue["Project"]]
            title = title_with_issue_id(issue_id, issue["Title"])
            description = render_description(issue)
            status = map_status(issue.get("Status", ""))
            created = parse_ts(issue.get("Created")) or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            updated = parse_ts(issue.get("Updated")) or created

            task_id = existing_issue_tasks.get(issue_id)
            if task_id:
                conn.execute(
                    """
                    UPDATE tasks
                    SET project_id = ?,
                        title = ?,
                        description = ?,
                        status = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (project_id, title, description, status, updated, task_id),
                )
                stats.tasks_updated += 1
            else:
                task_id = uuid.uuid4().bytes
                conn.execute(
                    """
                    INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (task_id, project_id, title, description, status, created, updated),
                )
                existing_issue_tasks[issue_id] = task_id
                stats.tasks_created += 1

            for attachment in attachment_rows_by_issue.get(issue_id, []):
                content = zf.read(attachment["File Path in ZIP"])
                hash_hex = hashlib.sha256(content).hexdigest()
                row = conn.execute("SELECT id FROM attachments WHERE hash = ?", (hash_hex,)).fetchone()
                if row:
                    attachment_id = row["id"]
                else:
                    stored_name = f"{uuid.uuid4()}_{sanitize_filename(attachment['Filename'])}"
                    (cache_dir / stored_name).write_bytes(content)
                    attachment_id = uuid.uuid4().bytes
                    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                    conn.execute(
                        """
                        INSERT INTO attachments (id, file_path, original_name, mime_type, size_bytes, hash, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            attachment_id,
                            stored_name,
                            attachment["Filename"],
                            attachment["Content Type"] or None,
                            int(attachment["Size (bytes)"]),
                            hash_hex,
                            now,
                            now,
                        ),
                    )
                    stats.attachments_created += 1

                link = conn.execute(
                    "SELECT 1 FROM task_attachments WHERE task_id = ? AND attachment_id = ?",
                    (task_id, attachment_id),
                ).fetchone()
                if not link:
                    conn.execute(
                        "INSERT INTO task_attachments (id, task_id, attachment_id) VALUES (?, ?, ?)",
                        (uuid.uuid4().bytes, task_id, attachment_id),
                    )
                    stats.task_attachment_links_created += 1

        if args.apply:
            conn.commit()
        else:
            conn.rollback()

    print(f"apply={args.apply}")
    print(f"projects_created={stats.projects_created}")
    print(f"projects_updated={stats.projects_updated}")
    print(f"repos_created={stats.repos_created}")
    print(f"project_repo_links_created={stats.project_repo_links_created}")
    print(f"tasks_created={stats.tasks_created}")
    print(f"tasks_updated={stats.tasks_updated}")
    print(f"attachments_created={stats.attachments_created}")
    print(f"task_attachment_links_created={stats.task_attachment_links_created}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
