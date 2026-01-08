#!/usr/bin/env python3
"""
vibe-kanban CLI - Direct API client for vibe-kanban task management.
Bypasses MCP and communicates directly with the backend API.

Usage:
    ./vk-cli.py projects                                    # List all projects
    ./vk-cli.py tasks <project_id>                          # List tasks in a project
    ./vk-cli.py task <task_id>                              # Get task details
    ./vk-cli.py create <project_id> "title" --team <team>   # Create team issue
    ./vk-cli.py create <project_id> "title"                 # Create project task
    ./vk-cli.py update <task_id> --status inprogress
    ./vk-cli.py teams                                       # List all teams
    ./vk-cli.py issues <team_id>                            # List issues for a team
"""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from dotenv import load_dotenv

# Load environment variables from project root
script_dir = Path(__file__).parent
root_dir = script_dir.parent
env_path = root_dir / ".env"
load_dotenv(dotenv_path=env_path)

if os.environ.get("VIBE_API_TOKEN"):
    print(f"Debug: Token found (starts with {os.environ['VIBE_API_TOKEN'][:10]}...)", file=sys.stderr)
else:
    print("Debug: No VIBE_API_TOKEN found in environment", file=sys.stderr)

# Default configuration
DEFAULT_PORT = 3003
DEFAULT_HOST = "127.0.0.1"

# Known project IDs for convenience
KNOWN_PROJECTS = {
    "frontend": "5b8810bc-b52f-464f-b87c-4a10542c14d3",
    "backend": "270d5829-6691-44b8-af81-594e70e88f15",
    "vibe-kanban": "1277542c-2247-4c9d-a236-c38173459694",
}

# Known team IDs for convenience
KNOWN_TEAMS = {
    "vibe-kanban": "ea68ef91-e9b7-4c28-9f53-077cf6a08fd3",
}

# Status mappings
STATUSES = ["todo", "inprogress", "inreview", "done", "cancelled"]


def get_base_url():
    """Get the backend URL from environment or port file."""
    # Check environment variable first
    if os.environ.get("VIBE_BACKEND_URL"):
        return os.environ["VIBE_BACKEND_URL"]

    # Check port file
    tmp_dir = os.environ.get("TMPDIR", "/tmp")
    port_file = Path(tmp_dir) / "vibe-kanban" / "vibe-kanban.port"

    if port_file.exists():
        port = port_file.read_text().strip()
        return f"http://{DEFAULT_HOST}:{port}"

    # Fall back to default
    return f"http://{DEFAULT_HOST}:{DEFAULT_PORT}"


def api_request(endpoint, method="GET", data=None):
    """Make an API request and return JSON response."""
    base_url = get_base_url()
    url = f"{base_url}/api{endpoint}"

    headers = {"Content-Type": "application/json"}
    
    # Add Authorization header if token is present
    if os.environ.get("VIBE_API_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['VIBE_API_TOKEN']}"

    if data:
        body = json.dumps(data).encode("utf-8")
        req = Request(url, data=body, headers=headers, method=method)
    else:
        req = Request(url, headers=headers, method=method)

    try:
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result
    except HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"HTTP Error {e.code}: {error_body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        print(f"Is the backend running? Try: curl {base_url}/api/projects", file=sys.stderr)
        sys.exit(1)


def resolve_project_id(project_ref):
    """Resolve project name or ID to actual ID."""
    if project_ref in KNOWN_PROJECTS:
        return KNOWN_PROJECTS[project_ref]
    return project_ref


def resolve_team_id(team_ref):
    """Resolve team name or ID to actual ID."""
    if team_ref in KNOWN_TEAMS:
        return KNOWN_TEAMS[team_ref]
    return team_ref


def format_task(task, verbose=False):
    """Format a task for display."""
    status_icons = {
        "todo": "○",
        "inprogress": "◐",
        "inreview": "◑",
        "done": "●",
        "cancelled": "✗",
    }
    icon = status_icons.get(task.get("status", ""), "?")
    title = task.get("title", "Untitled")
    task_id = task.get("id", "")[:8]
    status = task.get("status", "unknown")

    line = f"{icon} [{task_id}] {title}"

    if verbose:
        line += f"\n   Status: {status}"
        if task.get("description"):
            desc = task["description"][:100] + "..." if len(task.get("description", "")) > 100 else task.get("description", "")
            line += f"\n   Description: {desc}"
        if task.get("priority"):
            line += f"\n   Priority: {task['priority']}"

    return line


def cmd_projects(args):
    """List all projects."""
    result = api_request("/projects")

    if not result.get("success"):
        print("Failed to fetch projects", file=sys.stderr)
        sys.exit(1)

    projects = result.get("data", [])

    if args.json:
        print(json.dumps(projects, indent=2))
        return

    print(f"\n{'='*60}")
    print("PROJECTS")
    print(f"{'='*60}")

    for project in projects:
        name = project.get("name", "Untitled")
        pid = project.get("id", "")
        print(f"  {name}")
        print(f"    ID: {pid}")
        print()


def cmd_tasks(args):
    """List tasks in a project."""
    project_id = resolve_project_id(args.project_id)
    result = api_request(f"/tasks?project_id={project_id}")

    if not result.get("success"):
        print("Failed to fetch tasks", file=sys.stderr)
        sys.exit(1)

    tasks = result.get("data", [])

    if args.json:
        print(json.dumps(tasks, indent=2))
        return

    # Filter by status if specified
    if args.status:
        tasks = [t for t in tasks if t.get("status") == args.status]

    # Group by status
    by_status = {}
    for task in tasks:
        status = task.get("status", "unknown")
        if status not in by_status:
            by_status[status] = []
        by_status[status].append(task)

    print(f"\n{'='*60}")
    print(f"TASKS ({len(tasks)} total)")
    print(f"{'='*60}")

    for status in STATUSES:
        if status in by_status:
            print(f"\n## {status.upper()} ({len(by_status[status])})")
            for task in by_status[status]:
                print(f"  {format_task(task, args.verbose)}")


def cmd_task(args):
    """Get details of a specific task."""
    result = api_request(f"/tasks/{args.task_id}")

    if not result.get("success"):
        print("Failed to fetch task", file=sys.stderr)
        sys.exit(1)

    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"\n{'='*60}")
    print(f"TASK: {task.get('title', 'Untitled')}")
    print(f"{'='*60}")
    print(f"  ID:          {task.get('id', '')}")
    print(f"  Status:      {task.get('status', 'unknown')}")
    print(f"  Project ID:  {task.get('project_id', '')}")
    print(f"  Created:     {task.get('created_at', '')}")
    print(f"  Updated:     {task.get('updated_at', '')}")

    if task.get("priority"):
        print(f"  Priority:    {task['priority']}")
    if task.get("assignee_id"):
        print(f"  Assignee:    {task['assignee_id']}")
    if task.get("due_date"):
        print(f"  Due Date:    {task['due_date']}")

    if task.get("description"):
        print(f"\n  Description:")
        for line in task["description"].split("\n"):
            print(f"    {line}")


def cmd_create(args):
    """Create a new task (or team issue if --team is specified)."""
    project_id = resolve_project_id(args.project_id)

    data = {
        "project_id": project_id,
        "title": args.title,
    }

    if args.description:
        data["description"] = args.description
    if args.status:
        data["status"] = args.status
    if args.priority:
        data["priority"] = args.priority
    if args.team:
        data["team_id"] = resolve_team_id(args.team)

    result = api_request("/tasks", method="POST", data=data)

    if not result.get("success"):
        print("Failed to create task", file=sys.stderr)
        sys.exit(1)

    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    # Show issue number if it's a team issue
    issue_number = task.get("issue_number")
    if issue_number:
        print(f"✓ Created team issue: {task.get('id', '')}")
        print(f"  Issue #: {issue_number}")
    else:
        print(f"✓ Created task: {task.get('id', '')}")
    print(f"  Title: {task.get('title', '')}")
    print(f"  Status: {task.get('status', '')}")


def cmd_update(args):
    """Update an existing task."""
    data = {}

    if args.status:
        data["status"] = args.status
    if args.title:
        data["title"] = args.title
    if args.description:
        data["description"] = args.description
    if args.priority:
        data["priority"] = args.priority

    if not data:
        print("No updates specified. Use --status, --title, --description, or --priority", file=sys.stderr)
        sys.exit(1)

    result = api_request(f"/tasks/{args.task_id}", method="PUT", data=data)

    if not result.get("success"):
        print("Failed to update task", file=sys.stderr)
        sys.exit(1)

    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"✓ Updated task: {task.get('id', '')}")
    print(f"  Title: {task.get('title', '')}")
    print(f"  Status: {task.get('status', '')}")


def cmd_teams(args):
    """List all teams."""
    result = api_request("/teams")

    if not result.get("success"):
        print("Failed to fetch teams", file=sys.stderr)
        sys.exit(1)

    teams = result.get("data", [])

    if args.json:
        print(json.dumps(teams, indent=2))
        return

    print(f"\n{'='*60}")
    print("TEAMS")
    print(f"{'='*60}")

    for team in teams:
        name = team.get("name", "Untitled")
        tid = team.get("id", "")
        identifier = team.get("identifier", "")
        print(f"  {name} ({identifier})")
        print(f"    ID: {tid}")
        print()


def cmd_issues(args):
    """List issues for a team."""
    result = api_request(f"/teams/{args.team_id}/issues")

    if not result.get("success"):
        print("Failed to fetch issues", file=sys.stderr)
        sys.exit(1)

    issues = result.get("data", [])

    if args.json:
        print(json.dumps(issues, indent=2))
        return

    print(f"\n{'='*60}")
    print(f"TEAM ISSUES ({len(issues)} total)")
    print(f"{'='*60}")

    for issue in issues:
        print(f"  {format_task(issue, args.verbose)}")


def cmd_health(args):
    """Check backend health."""
    base_url = get_base_url()
    print(f"Backend URL: {base_url}")

    try:
        result = api_request("/projects")
        if result.get("success"):
            print("✓ Backend is healthy")
            print(f"  Projects: {len(result.get('data', []))}")
        else:
            print("✗ Backend returned error")
            sys.exit(1)
    except SystemExit:
        print("✗ Backend is not reachable")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="vibe-kanban CLI - Direct API client",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s projects                           List all projects
  %(prog)s tasks vibe-kanban                  List tasks (use project name)
  %(prog)s tasks 1277542c-2247-4c9d-a236-c38173459694  List tasks (use ID)
  %(prog)s task abc123                        Get task details
  %(prog)s create frontend "My task" --team vibe-kanban   Create team issue
  %(prog)s create vibe-kanban "My task"       Create project task (no team)
  %(prog)s update abc123 --status done        Update task status
  %(prog)s teams                              List all teams
  %(prog)s issues ea68ef91-...                List issues for a team
  %(prog)s health                             Check backend connection

Known project names: frontend, backend, vibe-kanban
Known team names: vibe-kanban
        """
    )

    parser.add_argument("--json", action="store_true", help="Output as JSON")

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # projects command
    subparsers.add_parser("projects", help="List all projects")

    # tasks command
    tasks_parser = subparsers.add_parser("tasks", help="List tasks in a project")
    tasks_parser.add_argument("project_id", help="Project ID or name (frontend, backend, vibe-kanban)")
    tasks_parser.add_argument("--status", choices=STATUSES, help="Filter by status")
    tasks_parser.add_argument("-v", "--verbose", action="store_true", help="Show more details")

    # task command
    task_parser = subparsers.add_parser("task", help="Get task details")
    task_parser.add_argument("task_id", help="Task ID")

    # create command
    create_parser = subparsers.add_parser("create", help="Create a new task or team issue")
    create_parser.add_argument("project_id", help="Project ID or name (frontend, backend, vibe-kanban)")
    create_parser.add_argument("title", help="Task title")
    create_parser.add_argument("-d", "--description", help="Task description")
    create_parser.add_argument("-s", "--status", choices=STATUSES, default="todo", help="Initial status")
    create_parser.add_argument("-p", "--priority", type=int, help="Priority (0-4)")
    create_parser.add_argument("-t", "--team", help="Team ID or name to create as team issue (e.g., vibe-kanban)")

    # update command
    update_parser = subparsers.add_parser("update", help="Update a task")
    update_parser.add_argument("task_id", help="Task ID")
    update_parser.add_argument("-s", "--status", choices=STATUSES, help="New status")
    update_parser.add_argument("-t", "--title", help="New title")
    update_parser.add_argument("-d", "--description", help="New description")
    update_parser.add_argument("-p", "--priority", type=int, help="New priority (0-4)")

    # teams command
    subparsers.add_parser("teams", help="List all teams")

    # issues command
    issues_parser = subparsers.add_parser("issues", help="List issues for a team")
    issues_parser.add_argument("team_id", help="Team ID")
    issues_parser.add_argument("-v", "--verbose", action="store_true", help="Show more details")

    # health command
    subparsers.add_parser("health", help="Check backend health")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Dispatch to command handler
    commands = {
        "projects": cmd_projects,
        "tasks": cmd_tasks,
        "task": cmd_task,
        "create": cmd_create,
        "update": cmd_update,
        "teams": cmd_teams,
        "issues": cmd_issues,
        "health": cmd_health,
    }

    handler = commands.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
