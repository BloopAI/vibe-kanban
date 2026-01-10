#!/usr/bin/env python3
"""
iKanban - Unified CLI & MCP Server for iKanban Task Management

Usage:
    CLI Mode (human use):
        ikanban teams                                    # List all teams
        ikanban projects                                 # List all projects
        ikanban issues IKA                               # List iKanban issues
        ikanban issues SCH --status inprogress           # Filter by status
        ikanban issues IKA --json                        # Output as JSON
        ikanban create IKA "title" -d "description"      # Create issue with description
        ikanban update IKA-27 --status done              # Update task by issue key
        ikanban update ika27 --status inprogress         # Case-insensitive, dash optional
        ikanban task IKA-27                              # Get task details by issue key
        ikanban task <uuid>                              # Also accepts UUID
        ikanban delete IKA-5                             # Delete task
        ikanban move IKA-10 <project_id>                 # Move task
        ikanban comments IKA-27                          # List comments
        ikanban comment IKA-27 "message"                 # Add comment

    Document Commands:
        ikanban upload IKA file1.md file2.md             # Upload files to team
        ikanban upload IKA file.md -t IKA-38             # Upload and link to task
        ikanban link IKA-38 <doc-uuid> <doc-uuid>        # Link docs to task
        ikanban unlink IKA-38 <doc-uuid>                 # Unlink doc from task
        ikanban docs IKA-38                              # List docs linked to task
        ikanban search-docs IKA "query"                  # Search team documents
        ikanban search-docs IKA                          # List all team documents

    MCP Server Mode (Claude Code):
        ikanban serve                                    # Start MCP server (stdio)
        ikanban --mcp                                    # Alias for serve

    Task ID formats (all commands accept):
        IKA-27, ika-27, IKA27, ika27                     # Issue key (recommended)
        ab802fb3-698e-4235-942c-b3ec7df6fa3c             # UUID (also works)

Installation:
    # Add to ~/.bashrc or ~/.zshrc:
    alias ikanban="python3 /path/to/vibe-kanban/mcp/ikanban.py"

    # Or create symlink:
    ln -s /path/to/vibe-kanban/mcp/ikanban.py /usr/local/bin/ikanban
"""

import argparse
import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Load environment variables from project root
try:
    from dotenv import load_dotenv
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent
    env_path = root_dir / ".env"
    load_dotenv(dotenv_path=env_path)
except ImportError:
    pass

# ============================================================================
# CONFIGURATION
# ============================================================================

VERSION = "2.3.0"

KNOWN_TEAMS = {
    "ikanban": "a263e43f-43d3-4af7-a947-5f70e6670921",
    "schild": "a2f22deb-901e-436b-9755-644cb26753b7",
    "ika": "a263e43f-43d3-4af7-a947-5f70e6670921",
    "sch": "a2f22deb-901e-436b-9755-644cb26753b7",
}

TEAM_DEFAULT_PROJECTS = {
    "a263e43f-43d3-4af7-a947-5f70e6670921": "ff89ece5-eb49-4d8b-a349-4fc227773cbc",
    "a2f22deb-901e-436b-9755-644cb26753b7": "ec364e49-b620-48e1-9dd1-8744eaedb5e2",
}

IKA_PROJECTS = {
    "frontend": "ff89ece5-eb49-4d8b-a349-4fc227773cbc",
    "backend": "use-dynamic-lookup",
    "integration": "use-dynamic-lookup",
}

SCH_PROJECTS = {
    "backend": "ec364e49-b620-48e1-9dd1-8744eaedb5e2",
    "frontend": "a0838686-0c56-4492-bf6d-65847451496a",
    "data-layer": "20f980e2-9cd8-427d-a11f-99cbff31acad",
    "temporal": "0ea3cbc6-11c3-4d68-bb99-7493a40de833",
    "elevenlabs": "e09697e8-c605-46a0-9dbc-877918fdca08",
    "infra": "b40b5eca-1856-4b69-928f-0ec3ecd2737b",
}

STATUSES = ["todo", "inprogress", "inreview", "done", "cancelled"]
PRIORITIES = {"none": 0, "urgent": 1, "high": 2, "medium": 3, "low": 4}

# ============================================================================
# API HELPERS
# ============================================================================

def get_base_url():
    return os.environ.get("VIBE_BACKEND_URL", "https://api.scho1ar.com")

def get_auth_token():
    return os.environ.get("VIBE_API_TOKEN")

def api_request(endpoint, method="GET", data=None, exit_on_error=True):
    """Make an API request and return JSON response."""
    url = f"{get_base_url()}/api{endpoint}"
    headers = {"Content-Type": "application/json"}

    auth_token = get_auth_token()
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        if data:
            body = json.dumps(data).encode("utf-8")
            req = Request(url, data=body, headers=headers, method=method)
        else:
            req = Request(url, headers=headers, method=method)

        with urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            error_json = json.loads(error_body)
            msg = error_json.get("message", error_body)
        except:
            msg = error_body
        if exit_on_error:
            print(f"HTTP {e.code}: {msg}", file=sys.stderr)
            sys.exit(1)
        return {"success": False, "error": f"HTTP {e.code}: {msg}"}
    except URLError as e:
        if exit_on_error:
            print(f"Connection error: {e.reason}", file=sys.stderr)
            sys.exit(1)
        return {"success": False, "error": f"Connection error: {e.reason}"}

def multipart_upload(endpoint, files, fields=None, exit_on_error=True):
    """Upload files using multipart/form-data."""
    url = f"{get_base_url()}/api{endpoint}"
    boundary = f"----WebKitFormBoundary{uuid.uuid4().hex[:16]}"

    body_parts = []

    # Add form fields
    if fields:
        for key, value in fields.items():
            if value is not None:
                body_parts.append(
                    f'--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
                    f'{value}\r\n'
                )

    # Add files
    for file_path in files:
        path = Path(file_path)
        if not path.exists():
            if exit_on_error:
                print(f"File not found: {file_path}", file=sys.stderr)
                sys.exit(1)
            return {"success": False, "error": f"File not found: {file_path}"}

        filename = path.name
        mime_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'

        with open(path, 'rb') as f:
            file_content = f.read()

        body_parts.append(
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="files[]"; filename="{filename}"\r\n'
            f'Content-Type: {mime_type}\r\n\r\n'
        )
        body_parts.append(file_content)
        body_parts.append(b'\r\n')

    body_parts.append(f'--{boundary}--\r\n')

    # Build body
    body = b''
    for part in body_parts:
        if isinstance(part, str):
            body += part.encode('utf-8')
        else:
            body += part

    headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
    }

    auth_token = get_auth_token()
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        req = Request(url, data=body, headers=headers, method="POST")
        with urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            error_json = json.loads(error_body)
            msg = error_json.get("message", error_body)
        except:
            msg = error_body
        if exit_on_error:
            print(f"HTTP {e.code}: {msg}", file=sys.stderr)
            sys.exit(1)
        return {"success": False, "error": f"HTTP {e.code}: {msg}"}
    except URLError as e:
        if exit_on_error:
            print(f"Connection error: {e.reason}", file=sys.stderr)
            sys.exit(1)
        return {"success": False, "error": f"Connection error: {e.reason}"}

def resolve_team_id(team_ref):
    if not team_ref:
        return None
    lower_ref = team_ref.lower()
    return KNOWN_TEAMS.get(lower_ref, team_ref)

def resolve_project_id(project_ref, team_id=None):
    if not project_ref:
        return TEAM_DEFAULT_PROJECTS.get(team_id) if team_id else None

    lower_ref = project_ref.lower()
    if team_id == "a263e43f-43d3-4af7-a947-5f70e6670921":
        if lower_ref in IKA_PROJECTS:
            proj_id = IKA_PROJECTS[lower_ref]
            if not proj_id.startswith("use-"):
                return proj_id
    elif team_id == "a2f22deb-901e-436b-9755-644cb26753b7":
        if lower_ref in SCH_PROJECTS:
            return SCH_PROJECTS[lower_ref]
    return project_ref

def get_team_identifier(team_id):
    for key, value in KNOWN_TEAMS.items():
        if value == team_id and len(key) == 3:
            return key.upper()
    return None

def parse_priority(priority_str):
    if priority_str is None:
        return None
    if isinstance(priority_str, int):
        return priority_str
    lower = str(priority_str).lower()
    if lower in PRIORITIES:
        return PRIORITIES[lower]
    try:
        return int(priority_str)
    except ValueError:
        return None

def resolve_task_id(task_ref):
    """
    Resolve a task reference to a UUID.

    Accepts:
      - UUID directly: "ab802fb3-698e-4235-942c-b3ec7df6fa3c"
      - Issue identifier: "IKA-27", "ika-27", "IKA27", "ika27", "SCH-5", etc.

    Returns the task UUID or exits with error if not found.
    """
    import re

    if not task_ref:
        print("Task ID is required", file=sys.stderr)
        sys.exit(1)

    # Check if it's already a UUID (contains dashes and is 36 chars)
    if len(task_ref) == 36 and task_ref.count('-') == 4:
        return task_ref

    # Try to parse as issue identifier (IKA-27, ika27, SCH-5, etc.)
    match = re.match(r'^([a-zA-Z]+)-?(\d+)$', task_ref.strip())
    if not match:
        # Not a recognized format, assume it's a UUID
        return task_ref

    team_key = match.group(1).lower()
    issue_number = int(match.group(2))

    # Resolve team ID
    team_id = KNOWN_TEAMS.get(team_key)
    if not team_id:
        print(f"Unknown team: {team_key.upper()}. Use IKA or SCH.", file=sys.stderr)
        sys.exit(1)

    # Fetch issues for this team and find the one with matching issue_number
    result = api_request(f"/teams/{team_id}/issues", exit_on_error=False)
    if "error" in result:
        print(f"Failed to fetch issues: {result['error']}", file=sys.stderr)
        sys.exit(1)

    issues = result.get("data", [])
    for issue in issues:
        if issue.get("issue_number") == issue_number:
            return issue["id"]

    print(f"Issue {team_key.upper()}-{issue_number} not found", file=sys.stderr)
    sys.exit(1)

# ============================================================================
# CLI COMMANDS
# ============================================================================

def cmd_teams(args):
    result = api_request("/teams")
    teams = result.get("data", [])

    if args.json:
        print(json.dumps(teams, indent=2))
        return

    print(f"\nTeams ({len(teams)}):")
    print(f"{'ID':<38} {'Name':<12} {'Identifier'}")
    print("-" * 60)
    for team in teams:
        print(f"{team.get('id', ''):<38} {team.get('name', ''):<12} {team.get('identifier', '')}")

def cmd_projects(args):
    result = api_request("/projects")
    projects = result.get("data", [])

    if args.json:
        print(json.dumps(projects, indent=2))
        return

    print(f"\nProjects ({len(projects)}):")
    print(f"{'ID':<38} {'Name'}")
    print("-" * 60)
    for project in projects:
        print(f"{project.get('id', ''):<38} {project.get('name', 'Untitled')}")

def cmd_issues(args):
    team_id = resolve_team_id(args.team)
    if not team_id:
        print("Team is required. Use: IKA, SCH, or team UUID", file=sys.stderr)
        sys.exit(1)

    result = api_request(f"/teams/{team_id}/issues")
    issues = result.get("data", [])
    team_identifier = get_team_identifier(team_id) or "?"

    if args.status:
        issues = [i for i in issues if i.get("status") == args.status]
    if args.assignee:
        issues = [i for i in issues if i.get("assignee_id") == args.assignee]

    if args.json:
        print(json.dumps(issues, indent=2))
        return

    print(f"\n{team_identifier} Issues ({len(issues)}):")
    print(f"{'#':<8} {'Status':<12} {'Pri':<4} {'Title'}")
    print("-" * 80)
    for issue in issues:
        num = f"{team_identifier}-{issue.get('issue_number', '?')}"
        status = issue.get("status", "?")
        priority = issue.get("priority") or "-"
        title = issue.get("title", "Untitled")[:50]
        print(f"{num:<8} {status:<12} {priority:<4} {title}")

def cmd_create(args):
    team_id = resolve_team_id(args.team)
    if not team_id:
        print("Team is required. Use: IKA, SCH, or team UUID", file=sys.stderr)
        sys.exit(1)

    project_id = resolve_project_id(args.project, team_id)
    if not project_id:
        print("No default project for team. Specify --project", file=sys.stderr)
        sys.exit(1)

    data = {
        "project_id": project_id,
        "title": args.title,
        "team_id": team_id,
        "status": args.status or "todo",
    }

    if args.description:
        data["description"] = args.description
    if args.priority is not None:
        priority = parse_priority(args.priority)
        if priority is not None:
            data["priority"] = priority
    if args.assignee:
        data["assignee_id"] = args.assignee
    if args.due_date:
        data["due_date"] = args.due_date

    result = api_request("/tasks", method="POST", data=data)
    task = result.get("data", {})
    team_identifier = get_team_identifier(team_id) or "?"

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"Created {team_identifier}-{task.get('issue_number')}: {task.get('title')}")
    print(f"  ID: {task.get('id')}")
    print(f"  Status: {task.get('status')}")

def cmd_update(args):
    task_id = resolve_task_id(args.task_id)

    data = {}
    if args.status:
        data["status"] = args.status
    if args.title:
        data["title"] = args.title
    if args.description:
        data["description"] = args.description
    if args.priority is not None:
        priority = parse_priority(args.priority)
        if priority is not None:
            data["priority"] = priority
    if args.assignee:
        data["assignee_id"] = args.assignee
    if args.due_date:
        data["due_date"] = args.due_date

    if not data:
        print("No updates specified. Use --status, --title, --description, --priority, --assignee, or --due-date", file=sys.stderr)
        sys.exit(1)

    result = api_request(f"/tasks/{task_id}", method="PUT", data=data)
    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"Updated: {task.get('title')}")
    print(f"  Status: {task.get('status')}")

def cmd_task(args):
    task_id = resolve_task_id(args.task_id)
    result = api_request(f"/tasks/{task_id}")
    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    team_id = task.get("team_id")
    team_identifier = get_team_identifier(team_id) if team_id else None
    issue_num = task.get("issue_number")

    if team_identifier and issue_num:
        print(f"\n{team_identifier}-{issue_num}: {task.get('title', 'Untitled')}")
    else:
        print(f"\n{task.get('title', 'Untitled')}")

    print(f"  ID:       {task.get('id', '')}")
    print(f"  Status:   {task.get('status', 'unknown')}")
    if task.get("priority"):
        print(f"  Priority: {task['priority']}")
    if task.get("assignee_id"):
        print(f"  Assignee: {task['assignee_id']}")
    if task.get("due_date"):
        print(f"  Due Date: {task['due_date']}")
    if task.get("description"):
        desc = task['description'][:100] + "..." if len(task['description']) > 100 else task['description']
        print(f"  Description: {desc}")

def cmd_delete(args):
    task_id = resolve_task_id(args.task_id)

    if not args.force:
        confirm = input(f"Delete task {args.task_id}? [y/N] ")
        if confirm.lower() != 'y':
            print("Cancelled")
            return

    result = api_request(f"/tasks/{task_id}", method="DELETE")

    if args.json:
        print(json.dumps({"deleted": True, "task_id": task_id}, indent=2))
        return
    print(f"Deleted task: {args.task_id}")

def cmd_move(args):
    task_id = resolve_task_id(args.task_id)
    data = {"project_id": args.project_id}
    result = api_request(f"/tasks/{task_id}/move", method="POST", data=data)
    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return
    print(f"Moved task to project: {args.project_id}")

def cmd_comments(args):
    task_id = resolve_task_id(args.task_id)
    result = api_request(f"/tasks/{task_id}/comments")
    comments = result.get("data", [])

    if args.json:
        print(json.dumps(comments, indent=2))
        return

    if not comments:
        print("No comments on this task")
        return

    print(f"\nComments ({len(comments)}):")
    print("-" * 60)
    for comment in comments:
        author = comment.get("author_name", "Unknown")
        created = comment.get("created_at", "")[:10]
        content = comment.get("content", "")
        print(f"[{created}] {author}:")
        print(f"  {content}\n")

def cmd_comment(args):
    task_id = resolve_task_id(args.task_id)
    data = {"content": args.content}
    # author_name is required by the API - use provided value or default
    data["author_name"] = args.author_name if args.author_name else "Claude Code"

    result = api_request(f"/tasks/{task_id}/comments", method="POST", data=data)
    comment = result.get("data", {})

    if args.json:
        print(json.dumps(comment, indent=2))
        return
    print(f"Added comment to task {args.task_id}")

# ============================================================================
# DOCUMENT COMMANDS
# ============================================================================

def cmd_upload(args):
    """Upload files to a team and optionally link to a task."""
    team_id = resolve_team_id(args.team)
    if not team_id:
        print("Team is required. Use: IKA, SCH, or team UUID", file=sys.stderr)
        sys.exit(1)

    # Validate files exist
    files = args.files
    for f in files:
        if not Path(f).exists():
            print(f"File not found: {f}", file=sys.stderr)
            sys.exit(1)

    # Upload files
    fields = {}
    if args.folder_id:
        fields['folder_id'] = args.folder_id

    result = multipart_upload(f"/teams/{team_id}/documents/upload", files, fields)
    upload_data = result.get("data", {})

    uploaded = upload_data.get("uploaded", 0)
    skipped = upload_data.get("skipped", 0)
    errors = upload_data.get("errors", [])
    uploaded_titles = upload_data.get("uploaded_titles", [])

    if args.json:
        print(json.dumps(upload_data, indent=2))
        return

    print(f"\nUpload Results:")
    print(f"  Uploaded: {uploaded}")
    if skipped > 0:
        print(f"  Skipped (duplicates): {skipped}")
    if errors:
        print(f"  Errors: {', '.join(errors)}")
    if uploaded_titles:
        print(f"  Titles: {', '.join(uploaded_titles)}")

    # If task specified, find and link the uploaded documents
    if args.task and uploaded > 0:
        task_id = resolve_task_id(args.task)

        # Search for uploaded documents to get their IDs
        doc_ids = []
        for title in uploaded_titles:
            # Search for documents by title (URL-encode the title)
            search_result = api_request(f"/teams/{team_id}/documents?search={quote(title)}", exit_on_error=False)
            docs = search_result.get("data", [])
            for doc in docs:
                if doc.get("title", "").lower() == title.lower():
                    doc_ids.append(doc["id"])
                    break

        if doc_ids:
            # Link documents to task
            link_result = api_request(
                f"/tasks/{task_id}/links",
                method="POST",
                data={"document_ids": doc_ids}
            )
            linked = link_result.get("data", [])
            print(f"\n  Linked {len(linked)} document(s) to task {args.task}")
        else:
            print(f"\n  Warning: Could not find document IDs to link to task")

def cmd_link(args):
    """Link existing documents to a task."""
    task_id = resolve_task_id(args.task_id)

    # document_ids can be UUIDs or we need to search by title
    doc_ids = []

    for doc_ref in args.document_ids:
        # Check if it looks like a UUID
        if len(doc_ref) == 36 and doc_ref.count('-') == 4:
            doc_ids.append(doc_ref)
        else:
            # Treat as search term - need team to search
            if not args.team:
                print(f"Team required to search for document by title: {doc_ref}", file=sys.stderr)
                sys.exit(1)
            team_id = resolve_team_id(args.team)
            search_result = api_request(f"/teams/{team_id}/documents?search={quote(doc_ref)}", exit_on_error=False)
            docs = search_result.get("data", [])
            found = False
            for doc in docs:
                if doc.get("title", "").lower() == doc_ref.lower():
                    doc_ids.append(doc["id"])
                    found = True
                    break
            if not found and docs:
                # Use first match if exact match not found
                doc_ids.append(docs[0]["id"])
                found = True
            if not found:
                print(f"Document not found: {doc_ref}", file=sys.stderr)

    if not doc_ids:
        print("No valid documents to link", file=sys.stderr)
        sys.exit(1)

    result = api_request(f"/tasks/{task_id}/links", method="POST", data={"document_ids": doc_ids})
    linked = result.get("data", [])

    if args.json:
        print(json.dumps(linked, indent=2))
        return

    print(f"Linked {len(linked)} document(s) to task {args.task_id}")
    for doc in linked:
        folder = f" ({doc.get('folder_name')})" if doc.get('folder_name') else ""
        print(f"  - {doc.get('document_title')}{folder}")

def cmd_docs(args):
    """List documents linked to a task."""
    task_id = resolve_task_id(args.task_id)

    result = api_request(f"/tasks/{task_id}/links")
    docs = result.get("data", [])

    if args.json:
        print(json.dumps(docs, indent=2))
        return

    if not docs:
        print(f"No documents linked to task {args.task_id}")
        return

    print(f"\nLinked Documents ({len(docs)}):")
    print(f"{'ID':<38} {'Title':<40} {'Folder'}")
    print("-" * 100)
    for doc in docs:
        doc_id = doc.get("document_id", "")
        title = doc.get("document_title", "Untitled")[:38]
        folder = doc.get("folder_name") or "-"
        print(f"{doc_id:<38} {title:<40} {folder}")

def cmd_search_docs(args):
    """Search for documents in a team."""
    team_id = resolve_team_id(args.team)
    if not team_id:
        print("Team is required. Use: IKA, SCH, or team UUID", file=sys.stderr)
        sys.exit(1)

    params = f"search={quote(args.query)}" if args.query else "all=true"
    result = api_request(f"/teams/{team_id}/documents?{params}")
    docs = result.get("data", [])

    if args.json:
        print(json.dumps(docs, indent=2))
        return

    if not docs:
        print("No documents found")
        return

    print(f"\nDocuments ({len(docs)}):")
    print(f"{'ID':<38} {'Title':<40} {'Type':<8} {'Folder'}")
    print("-" * 100)
    for doc in docs:
        doc_id = doc.get("id", "")
        title = doc.get("title", "Untitled")[:38]
        file_type = doc.get("file_type", "-")[:6]
        folder = doc.get("folder_name") or "-"
        print(f"{doc_id:<38} {title:<40} {file_type:<8} {folder}")

def cmd_unlink(args):
    """Unlink a document from a task."""
    task_id = resolve_task_id(args.task_id)

    result = api_request(f"/tasks/{task_id}/links/{args.document_id}", method="DELETE")

    if args.json:
        print(json.dumps({"unlinked": True, "task_id": task_id, "document_id": args.document_id}, indent=2))
        return

    print(f"Unlinked document {args.document_id} from task {args.task_id}")

# ============================================================================
# MCP SERVER MODE
# ============================================================================

def run_mcp_server():
    """Run as MCP server (stdio mode for Claude Code)."""

    # MCP Tool definitions
    TOOLS = [
        {
            "name": "ikanban_list_teams",
            "description": "List all teams in iKanban.",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "ikanban_list_projects",
            "description": "List all projects in iKanban.",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "ikanban_list_issues",
            "description": "List issues for a team with optional status filter.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "team": {"type": "string", "description": "Team: IKA, SCH, or UUID", "default": "IKA"},
                    "status": {"type": "string", "enum": STATUSES, "description": "Filter by status"}
                }
            }
        },
        {
            "name": "ikanban_list_tasks",
            "description": "List tasks in a project.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": {"type": "string", "description": "Project name or UUID", "default": "frontend"},
                    "status": {"type": "string", "enum": STATUSES}
                }
            }
        },
        {
            "name": "ikanban_get_task",
            "description": "Get task details by ID.",
            "inputSchema": {
                "type": "object",
                "properties": {"task_id": {"type": "string", "description": "Task UUID"}},
                "required": ["task_id"]
            }
        },
        {
            "name": "ikanban_create_issue",
            "description": "Create a new team issue. Returns issue key like IKA-123.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Issue title"},
                    "team": {"type": "string", "description": "Team: IKA, SCH", "default": "IKA"},
                    "project": {"type": "string", "description": "Project name or UUID"},
                    "description": {"type": "string"},
                    "status": {"type": "string", "enum": STATUSES, "default": "todo"},
                    "priority": {"type": ["integer", "string"], "description": "1=Urgent, 2=High, 3=Medium, 4=Low"},
                    "assignee_id": {"type": "string"},
                    "due_date": {"type": "string", "description": "YYYY-MM-DD"}
                },
                "required": ["title"]
            }
        },
        {
            "name": "ikanban_update_task",
            "description": "Update task status, title, description, priority, assignee, or due date.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "status": {"type": "string", "enum": STATUSES},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": ["integer", "string"]},
                    "assignee_id": {"type": "string"},
                    "due_date": {"type": "string"}
                },
                "required": ["task_id"]
            }
        },
        {
            "name": "ikanban_delete_task",
            "description": "Delete a task permanently.",
            "inputSchema": {
                "type": "object",
                "properties": {"task_id": {"type": "string"}},
                "required": ["task_id"]
            }
        },
        {
            "name": "ikanban_move_task",
            "description": "Move task to another project.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "project_id": {"type": "string"}
                },
                "required": ["task_id", "project_id"]
            }
        },
        {
            "name": "ikanban_list_comments",
            "description": "List comments on a task.",
            "inputSchema": {
                "type": "object",
                "properties": {"task_id": {"type": "string"}},
                "required": ["task_id"]
            }
        },
        {
            "name": "ikanban_add_comment",
            "description": "Add a comment to a task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "content": {"type": "string"},
                    "author_name": {"type": "string"}
                },
                "required": ["task_id", "content"]
            }
        },
        # Document operations
        {
            "name": "ikanban_search_documents",
            "description": "Search for documents in a team by title or get all documents.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "team": {"type": "string", "description": "Team: IKA, SCH, or UUID", "default": "IKA"},
                    "query": {"type": "string", "description": "Search query (optional, omit to list all)"}
                }
            }
        },
        {
            "name": "ikanban_get_task_documents",
            "description": "Get all documents linked to a task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "Task UUID or issue key (e.g., IKA-38)"}
                },
                "required": ["task_id"]
            }
        },
        {
            "name": "ikanban_link_documents",
            "description": "Link one or more documents to a task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "Task UUID or issue key (e.g., IKA-38)"},
                    "document_ids": {"type": "array", "items": {"type": "string"}, "description": "List of document UUIDs to link"}
                },
                "required": ["task_id", "document_ids"]
            }
        },
        {
            "name": "ikanban_unlink_document",
            "description": "Unlink a document from a task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "Task UUID or issue key (e.g., IKA-38)"},
                    "document_id": {"type": "string", "description": "Document UUID to unlink"}
                },
                "required": ["task_id", "document_id"]
            }
        },
    ]

    def handle_tool(name, args):
        """Handle MCP tool calls."""
        if name == "ikanban_list_teams":
            result = api_request("/teams", exit_on_error=False)
            if result.get("success"):
                teams = result.get("data", [])
                return {"teams": [{"id": t["id"], "name": t["name"], "identifier": t.get("identifier")} for t in teams]}
            return {"error": result.get("error")}

        elif name == "ikanban_list_projects":
            result = api_request("/projects", exit_on_error=False)
            if result.get("success"):
                return {"projects": [{"id": p["id"], "name": p["name"]} for p in result.get("data", [])]}
            return {"error": result.get("error")}

        elif name == "ikanban_list_issues":
            team_id = resolve_team_id(args.get("team", "IKA"))
            result = api_request(f"/teams/{team_id}/issues", exit_on_error=False)
            if result.get("success"):
                issues = result.get("data", [])
                if args.get("status"):
                    issues = [i for i in issues if i.get("status") == args["status"]]
                team_ident = get_team_identifier(team_id) or "?"
                return {"team": team_ident, "issues": [
                    {"id": i["id"], "issue_key": f"{team_ident}-{i.get('issue_number')}",
                     "title": i["title"], "status": i["status"], "priority": i.get("priority")}
                    for i in issues
                ], "count": len(issues)}
            return {"error": result.get("error")}

        elif name == "ikanban_list_tasks":
            project_id = resolve_project_id(args.get("project", "frontend"))
            endpoint = f"/tasks?project_id={project_id}"
            if args.get("status"):
                endpoint += f"&status={args['status']}"
            result = api_request(endpoint, exit_on_error=False)
            if result.get("success"):
                return {"tasks": result.get("data", []), "count": len(result.get("data", []))}
            return {"error": result.get("error")}

        elif name == "ikanban_get_task":
            result = api_request(f"/tasks/{args['task_id']}", exit_on_error=False)
            if result.get("success"):
                task = result.get("data", {})
                team_ident = get_team_identifier(task.get("team_id"))
                if team_ident and task.get("issue_number"):
                    task["issue_key"] = f"{team_ident}-{task['issue_number']}"
                return {"task": task}
            return {"error": result.get("error")}

        elif name == "ikanban_create_issue":
            team_id = resolve_team_id(args.get("team", "IKA"))
            project_id = resolve_project_id(args.get("project"), team_id)
            data = {"project_id": project_id, "title": args["title"], "team_id": team_id, "status": args.get("status", "todo")}
            for field in ["description", "assignee_id", "due_date"]:
                if args.get(field):
                    data[field] = args[field]
            if args.get("priority") is not None:
                data["priority"] = parse_priority(args["priority"])

            result = api_request("/tasks", method="POST", data=data, exit_on_error=False)
            if result.get("success"):
                task = result.get("data", {})
                team_ident = get_team_identifier(team_id) or "?"
                return {"task_id": task.get("id"), "issue_key": f"{team_ident}-{task.get('issue_number')}",
                        "title": task.get("title"), "status": task.get("status")}
            return {"error": result.get("error")}

        elif name == "ikanban_update_task":
            data = {}
            for field in ["status", "title", "description", "assignee_id", "due_date"]:
                if args.get(field):
                    data[field] = args[field]
            if args.get("priority") is not None:
                data["priority"] = parse_priority(args["priority"])

            result = api_request(f"/tasks/{args['task_id']}", method="PUT", data=data, exit_on_error=False)
            if result.get("success"):
                task = result.get("data", {})
                return {"task_id": task.get("id"), "title": task.get("title"), "status": task.get("status")}
            return {"error": result.get("error")}

        elif name == "ikanban_delete_task":
            result = api_request(f"/tasks/{args['task_id']}", method="DELETE", exit_on_error=False)
            if result.get("success"):
                return {"deleted": True, "task_id": args["task_id"]}
            return {"error": result.get("error")}

        elif name == "ikanban_move_task":
            result = api_request(f"/tasks/{args['task_id']}/move", method="POST",
                                data={"project_id": args["project_id"]}, exit_on_error=False)
            if result.get("success"):
                return {"moved": True, "task_id": args["task_id"], "project_id": args["project_id"]}
            return {"error": result.get("error")}

        elif name == "ikanban_list_comments":
            result = api_request(f"/tasks/{args['task_id']}/comments", exit_on_error=False)
            if result.get("success"):
                return {"comments": result.get("data", []), "count": len(result.get("data", []))}
            return {"error": result.get("error")}

        elif name == "ikanban_add_comment":
            data = {"content": args["content"]}
            # author_name is required by the API - use provided value or default
            data["author_name"] = args.get("author_name") or "Claude Code"
            result = api_request(f"/tasks/{args['task_id']}/comments", method="POST", data=data, exit_on_error=False)
            if result.get("success"):
                return {"comment_id": result.get("data", {}).get("id"), "task_id": args["task_id"]}
            return {"error": result.get("error")}

        # Document operations
        elif name == "ikanban_search_documents":
            team_id = resolve_team_id(args.get("team", "IKA"))
            query = args.get("query")
            params = f"search={quote(query)}" if query else "all=true"
            result = api_request(f"/teams/{team_id}/documents?{params}", exit_on_error=False)
            if result.get("success"):
                docs = result.get("data", [])
                return {"documents": [
                    {"id": d["id"], "title": d.get("title", "Untitled"),
                     "file_type": d.get("file_type"), "folder_name": d.get("folder_name")}
                    for d in docs
                ], "count": len(docs)}
            return {"error": result.get("error")}

        elif name == "ikanban_get_task_documents":
            task_id = resolve_task_id(args["task_id"])
            result = api_request(f"/tasks/{task_id}/links", exit_on_error=False)
            if result.get("success"):
                docs = result.get("data", [])
                return {"documents": [
                    {"document_id": d["document_id"], "title": d.get("document_title", "Untitled"),
                     "folder_name": d.get("folder_name"), "linked_at": d.get("linked_at")}
                    for d in docs
                ], "count": len(docs)}
            return {"error": result.get("error")}

        elif name == "ikanban_link_documents":
            task_id = resolve_task_id(args["task_id"])
            result = api_request(f"/tasks/{task_id}/links", method="POST",
                                data={"document_ids": args["document_ids"]}, exit_on_error=False)
            if result.get("success"):
                docs = result.get("data", [])
                return {"linked": len(docs), "documents": [
                    {"document_id": d["document_id"], "title": d.get("document_title")}
                    for d in docs
                ]}
            return {"error": result.get("error")}

        elif name == "ikanban_unlink_document":
            task_id = resolve_task_id(args["task_id"])
            result = api_request(f"/tasks/{task_id}/links/{args['document_id']}", method="DELETE", exit_on_error=False)
            if result.get("success"):
                return {"unlinked": True, "task_id": task_id, "document_id": args["document_id"]}
            return {"error": result.get("error")}

        return {"error": f"Unknown tool: {name}"}

    def send_response(response):
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    # Main MCP loop
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            method = request.get("method")
            params = request.get("params", {})
            request_id = request.get("id")

            if method == "initialize":
                send_response({
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "ikanban", "version": VERSION}
                    }
                })
            elif method == "tools/list":
                send_response({"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}})
            elif method == "tools/call":
                result = handle_tool(params.get("name"), params.get("arguments", {}))
                send_response({
                    "jsonrpc": "2.0", "id": request_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
                })
            elif method == "notifications/initialized":
                pass  # No response needed
            else:
                send_response({
                    "jsonrpc": "2.0", "id": request_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"}
                })
        except json.JSONDecodeError as e:
            send_response({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}})

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        prog="ikanban",
        description="iKanban - Unified CLI & MCP Server for Task Management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ikanban teams                              List all teams
  ikanban issues IKA                         List iKanban issues
  ikanban issues IKA -s inprogress           Filter by status
  ikanban create IKA "Fix bug" -p high       Create with priority
  ikanban update <id> --status done          Mark done
  ikanban delete <id> --force                Delete task
  ikanban serve                              Start MCP server

Teams: IKA (iKanban), SCH (Schild)
Statuses: todo, inprogress, inreview, done, cancelled
Priorities: urgent, high, medium, low (or 1-4)
        """
    )

    parser.add_argument("--version", "-v", action="version", version=f"iKanban {VERSION}")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--mcp", action="store_true", help="Run as MCP server")

    subparsers = parser.add_subparsers(dest="command")

    # serve (MCP mode)
    subparsers.add_parser("serve", help="Start MCP server for Claude Code")

    # teams
    p = subparsers.add_parser("teams", help="List all teams")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # projects
    p = subparsers.add_parser("projects", help="List all projects")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # issues
    p = subparsers.add_parser("issues", help="List team issues")
    p.add_argument("team", help="Team: IKA, SCH, or UUID")
    p.add_argument("--status", "-s", choices=STATUSES)
    p.add_argument("--assignee", "-a")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # create
    p = subparsers.add_parser("create", help="Create issue")
    p.add_argument("team", help="Team: IKA, SCH")
    p.add_argument("title")
    p.add_argument("--project")
    p.add_argument("--description", "-d")
    p.add_argument("--status", "-s", choices=STATUSES, default="todo")
    p.add_argument("--priority", "-p")
    p.add_argument("--assignee", "-a")
    p.add_argument("--due-date", dest="due_date")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # update
    p = subparsers.add_parser("update", help="Update task")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-27)")
    p.add_argument("--status", "-s", choices=STATUSES)
    p.add_argument("--title", "-t")
    p.add_argument("--description", "-d")
    p.add_argument("--priority", "-p")
    p.add_argument("--assignee", "-a")
    p.add_argument("--due-date", dest="due_date")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # task
    p = subparsers.add_parser("task", help="Get task details")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-27)")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # delete
    p = subparsers.add_parser("delete", help="Delete task")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-27)")
    p.add_argument("--force", "-f", action="store_true")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # move
    p = subparsers.add_parser("move", help="Move task to project")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-27)")
    p.add_argument("project_id")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # comments
    p = subparsers.add_parser("comments", help="List task comments")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-27)")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # comment
    p = subparsers.add_parser("comment", help="Add comment")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-27)")
    p.add_argument("content")
    p.add_argument("--author", dest="author_name")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # upload - upload files and optionally link to task
    p = subparsers.add_parser("upload", help="Upload files to team, optionally link to task")
    p.add_argument("team", help="Team: IKA, SCH")
    p.add_argument("files", nargs="+", help="File(s) to upload")
    p.add_argument("--task", "-t", help="Task to link uploaded docs to (e.g., IKA-38)")
    p.add_argument("--folder-id", "-f", dest="folder_id", help="Folder UUID to upload into")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # link - link existing documents to a task
    p = subparsers.add_parser("link", help="Link documents to a task")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-38)")
    p.add_argument("document_ids", nargs="+", help="Document UUID(s) or title(s) to link")
    p.add_argument("--team", help="Team (required if searching by title)")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # unlink - unlink a document from a task
    p = subparsers.add_parser("unlink", help="Unlink document from task")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-38)")
    p.add_argument("document_id", help="Document UUID to unlink")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # docs - list documents linked to a task
    p = subparsers.add_parser("docs", help="List documents linked to a task")
    p.add_argument("task_id", help="Task UUID or issue key (e.g., IKA-38)")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    # search-docs - search for documents
    p = subparsers.add_parser("search-docs", help="Search documents in a team")
    p.add_argument("team", help="Team: IKA, SCH")
    p.add_argument("query", nargs="?", help="Search query (optional, lists all if omitted)")
    p.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    # MCP server mode
    if args.mcp or args.command == "serve":
        run_mcp_server()
        return

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Check token
    if not get_auth_token():
        print("Warning: VIBE_API_TOKEN not set", file=sys.stderr)

    # Route to command handlers
    handlers = {
        "teams": cmd_teams, "projects": cmd_projects, "issues": cmd_issues,
        "create": cmd_create, "update": cmd_update, "task": cmd_task,
        "delete": cmd_delete, "move": cmd_move, "comments": cmd_comments, "comment": cmd_comment,
        # Document commands
        "upload": cmd_upload, "link": cmd_link, "unlink": cmd_unlink,
        "docs": cmd_docs, "search-docs": cmd_search_docs,
    }

    handler = handlers.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
