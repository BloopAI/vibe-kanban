#!/usr/bin/env python3
"""
vibe-kanban CLI - Direct API client for vibe-kanban task management.

Usage:
    ./cli.py teams                                    # List all teams
    ./cli.py projects                                 # List all projects
    ./cli.py issues IKA                               # List issues for iKanban team
    ./cli.py issues SCH --status inprogress           # Filter by status
    ./cli.py create IKA "title"                       # Create issue in iKanban
    ./cli.py create SCH "title" --project backend     # Create issue in Schild
    ./cli.py update <task_id> --status done           # Update task status
    ./cli.py task <task_id>                           # Get task details
    ./cli.py delete <task_id>                         # Delete a task
    ./cli.py move <task_id> <project_id>              # Move task to another project
    ./cli.py comments <task_id>                       # List task comments
    ./cli.py comment <task_id> "message"              # Add comment to task
"""

import argparse
import json
import os
import sys
from pathlib import Path
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
    pass  # dotenv not required if env vars are set

# ============================================================================
# CONFIGURATION - Shared between cli.py and server.py
# ============================================================================

# Team registry with identifiers and default projects
KNOWN_TEAMS = {
    # By name (lowercase)
    "ikanban": "a263e43f-43d3-4af7-a947-5f70e6670921",
    "schild": "a2f22deb-901e-436b-9755-644cb26753b7",
    # By identifier (case-insensitive lookup)
    "ika": "a263e43f-43d3-4af7-a947-5f70e6670921",
    "sch": "a2f22deb-901e-436b-9755-644cb26753b7",
}

# Default project for each team (used when no project specified)
TEAM_DEFAULT_PROJECTS = {
    "a263e43f-43d3-4af7-a947-5f70e6670921": "ff89ece5-eb49-4d8b-a349-4fc227773cbc",  # ikanban -> frontend
    "a2f22deb-901e-436b-9755-644cb26753b7": "ec364e49-b620-48e1-9dd1-8744eaedb5e2",  # schild -> backend
}

# Project name aliases (IKA team)
IKA_PROJECTS = {
    "frontend": "ff89ece5-eb49-4d8b-a349-4fc227773cbc",
    "backend": "use-vk_list_projects",  # Look up dynamically
    "integration": "use-vk_list_projects",
}

# Project name aliases (SCH team)
SCH_PROJECTS = {
    "backend": "ec364e49-b620-48e1-9dd1-8744eaedb5e2",
    "frontend": "a0838686-0c56-4492-bf6d-65847451496a",
    "data-layer": "20f980e2-9cd8-427d-a11f-99cbff31acad",
    "temporal": "0ea3cbc6-11c3-4d68-bb99-7493a40de833",
    "elevenlabs": "e09697e8-c605-46a0-9dbc-877918fdca08",
    "infra": "b40b5eca-1856-4b69-928f-0ec3ecd2737b",
}

STATUSES = ["todo", "inprogress", "inreview", "done", "cancelled"]
PRIORITIES = {
    "none": 0,
    "urgent": 1,
    "high": 2,
    "medium": 3,
    "low": 4,
}

# ============================================================================
# API HELPERS
# ============================================================================

def get_base_url():
    """Get the backend URL - defaults to production API."""
    if os.environ.get("VIBE_BACKEND_URL"):
        return os.environ["VIBE_BACKEND_URL"]
    return "https://api.scho1ar.com"


def get_auth_token():
    """Get the API token from environment."""
    return os.environ.get("VIBE_API_TOKEN")


def api_request(endpoint, method="GET", data=None):
    """Make an API request and return JSON response."""
    base_url = get_base_url()
    url = f"{base_url}/api{endpoint}"
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
        print(f"HTTP {e.code}: {msg}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def resolve_team_id(team_ref):
    """Resolve team name, identifier, or ID to actual ID (case-insensitive)."""
    if not team_ref:
        return None
    lower_ref = team_ref.lower()
    return KNOWN_TEAMS.get(lower_ref, team_ref)


def resolve_project_id(project_ref, team_id=None):
    """Resolve project name or ID to actual ID."""
    if not project_ref:
        return TEAM_DEFAULT_PROJECTS.get(team_id) if team_id else None

    # Check team-specific projects first
    if team_id == "a263e43f-43d3-4af7-a947-5f70e6670921":  # IKA
        if project_ref.lower() in IKA_PROJECTS:
            proj_id = IKA_PROJECTS[project_ref.lower()]
            if proj_id != "use-vk_list_projects":
                return proj_id
    elif team_id == "a2f22deb-901e-436b-9755-644cb26753b7":  # SCH
        if project_ref.lower() in SCH_PROJECTS:
            return SCH_PROJECTS[project_ref.lower()]

    return project_ref  # Assume it's a UUID


def get_team_identifier(team_id):
    """Get the team identifier (IKA, SCH) from team ID."""
    for key, value in KNOWN_TEAMS.items():
        if value == team_id and len(key) == 3:  # Only return 3-letter identifiers
            return key.upper()
    return None


def parse_priority(priority_str):
    """Parse priority string or int to integer value."""
    if priority_str is None:
        return None
    if isinstance(priority_str, int):
        return priority_str
    lower = priority_str.lower()
    if lower in PRIORITIES:
        return PRIORITIES[lower]
    try:
        return int(priority_str)
    except ValueError:
        return None


# ============================================================================
# COMMAND HANDLERS
# ============================================================================

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

    print(f"\nTeams:")
    print(f"{'ID':<38} {'Name':<12} {'Identifier'}")
    print("-" * 60)
    for team in teams:
        print(f"{team.get('id', ''):<38} {team.get('name', ''):<12} {team.get('identifier', '')}")


def cmd_issues(args):
    """List issues for a team."""
    team_id = resolve_team_id(args.team)
    if not team_id:
        print("Team is required. Use: IKA, SCH, or team UUID", file=sys.stderr)
        sys.exit(1)

    result = api_request(f"/teams/{team_id}/issues")
    if not result.get("success"):
        print("Failed to fetch issues", file=sys.stderr)
        sys.exit(1)

    issues = result.get("data", [])
    team_identifier = get_team_identifier(team_id) or "?"

    # Filter by status if specified
    if args.status:
        issues = [i for i in issues if i.get("status") == args.status]

    # Filter by assignee if specified
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
    """Create a new team issue."""
    team_id = resolve_team_id(args.team)
    if not team_id:
        print("Team is required. Use: IKA, SCH, or team UUID", file=sys.stderr)
        sys.exit(1)

    project_id = resolve_project_id(args.project, team_id)
    if not project_id:
        print(f"No default project for team. Specify --project", file=sys.stderr)
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
    if not result.get("success"):
        print("Failed to create issue", file=sys.stderr)
        sys.exit(1)

    task = result.get("data", {})
    team_identifier = get_team_identifier(team_id) or "?"

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"Created {team_identifier}-{task.get('issue_number')}: {task.get('title')}")
    print(f"  ID: {task.get('id')}")
    print(f"  Status: {task.get('status')}")


def cmd_update(args):
    """Update an existing task."""
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

    result = api_request(f"/tasks/{args.task_id}", method="PUT", data=data)
    if not result.get("success"):
        print("Failed to update task", file=sys.stderr)
        sys.exit(1)

    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"Updated: {task.get('title')}")
    print(f"  Status: {task.get('status')}")


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
        desc = task['description']
        if len(desc) > 100:
            desc = desc[:100] + "..."
        print(f"  Description: {desc}")


def cmd_delete(args):
    """Delete a task."""
    if not args.force:
        confirm = input(f"Are you sure you want to delete task {args.task_id}? [y/N] ")
        if confirm.lower() != 'y':
            print("Cancelled")
            return

    result = api_request(f"/tasks/{args.task_id}", method="DELETE")
    if not result.get("success"):
        print("Failed to delete task", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps({"deleted": True, "task_id": args.task_id}, indent=2))
        return

    print(f"Deleted task: {args.task_id}")


def cmd_move(args):
    """Move a task to another project."""
    data = {"project_id": args.project_id}

    result = api_request(f"/tasks/{args.task_id}/move", method="POST", data=data)
    if not result.get("success"):
        print("Failed to move task", file=sys.stderr)
        sys.exit(1)

    task = result.get("data", {})

    if args.json:
        print(json.dumps(task, indent=2))
        return

    print(f"Moved task to project: {args.project_id}")
    print(f"  Task: {task.get('title')}")


def cmd_comments(args):
    """List comments for a task."""
    result = api_request(f"/tasks/{args.task_id}/comments")
    if not result.get("success"):
        print("Failed to fetch comments", file=sys.stderr)
        sys.exit(1)

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
        print(f"  {content}")
        print()


def cmd_comment(args):
    """Add a comment to a task."""
    data = {"content": args.content}

    if args.author_name:
        data["author_name"] = args.author_name

    result = api_request(f"/tasks/{args.task_id}/comments", method="POST", data=data)
    if not result.get("success"):
        print("Failed to add comment", file=sys.stderr)
        sys.exit(1)

    comment = result.get("data", {})

    if args.json:
        print(json.dumps(comment, indent=2))
        return

    print(f"Added comment to task {args.task_id}")
    print(f"  ID: {comment.get('id')}")


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

    print(f"\nProjects ({len(projects)}):")
    print(f"{'ID':<38} {'Name'}")
    print("-" * 60)
    for project in projects:
        print(f"{project.get('id', ''):<38} {project.get('name', 'Untitled')}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="vibe-kanban CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s teams                              List all teams
  %(prog)s projects                           List all projects
  %(prog)s issues IKA                         List iKanban issues
  %(prog)s issues SCH --status inprogress     List Schild in-progress issues
  %(prog)s create IKA "Fix bug"               Create issue in iKanban
  %(prog)s create SCH "Add feature" -p 1      Create urgent issue in Schild
  %(prog)s update <id> --status done          Mark task done
  %(prog)s task <id>                          Get task details
  %(prog)s delete <id>                        Delete a task
  %(prog)s delete <id> --force                Delete without confirmation
  %(prog)s move <id> <project_id>             Move task to project
  %(prog)s comments <id>                      List task comments
  %(prog)s comment <id> "Great work!"         Add comment to task

Teams: IKA (iKanban), SCH (Schild)
Statuses: todo, inprogress, inreview, done, cancelled
Priorities: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low (or use names)
        """
    )

    parser.add_argument("--json", action="store_true", help="Output as JSON")
    subparsers = parser.add_subparsers(dest="command", help="Command")

    # teams
    subparsers.add_parser("teams", help="List all teams")

    # projects
    subparsers.add_parser("projects", help="List all projects")

    # issues
    issues_p = subparsers.add_parser("issues", help="List issues for a team")
    issues_p.add_argument("team", help="Team: IKA, SCH, or UUID")
    issues_p.add_argument("--status", "-s", choices=STATUSES, help="Filter by status")
    issues_p.add_argument("--assignee", "-a", help="Filter by assignee ID")

    # create
    create_p = subparsers.add_parser("create", help="Create a new issue")
    create_p.add_argument("team", help="Team: IKA, SCH, or UUID")
    create_p.add_argument("title", help="Issue title")
    create_p.add_argument("--project", help="Project name or ID (optional)")
    create_p.add_argument("--description", "-d", help="Description")
    create_p.add_argument("--status", "-s", choices=STATUSES, default="todo")
    create_p.add_argument("--priority", "-p", help="Priority: 0-4 or urgent/high/medium/low")
    create_p.add_argument("--assignee", "-a", help="Assignee user ID")
    create_p.add_argument("--due-date", dest="due_date", help="Due date (ISO format: YYYY-MM-DD)")

    # update
    update_p = subparsers.add_parser("update", help="Update a task")
    update_p.add_argument("task_id", help="Task UUID")
    update_p.add_argument("--status", "-s", choices=STATUSES, help="New status")
    update_p.add_argument("--title", "-t", help="New title")
    update_p.add_argument("--description", "-d", help="New description")
    update_p.add_argument("--priority", "-p", help="New priority: 0-4 or urgent/high/medium/low")
    update_p.add_argument("--assignee", "-a", help="Assignee user ID")
    update_p.add_argument("--due-date", dest="due_date", help="Due date (ISO format: YYYY-MM-DD)")

    # task
    task_p = subparsers.add_parser("task", help="Get task details")
    task_p.add_argument("task_id", help="Task UUID")

    # delete
    delete_p = subparsers.add_parser("delete", help="Delete a task")
    delete_p.add_argument("task_id", help="Task UUID")
    delete_p.add_argument("--force", "-f", action="store_true", help="Skip confirmation")

    # move
    move_p = subparsers.add_parser("move", help="Move task to another project")
    move_p.add_argument("task_id", help="Task UUID")
    move_p.add_argument("project_id", help="Target project UUID")

    # comments
    comments_p = subparsers.add_parser("comments", help="List comments for a task")
    comments_p.add_argument("task_id", help="Task UUID")

    # comment (add)
    comment_p = subparsers.add_parser("comment", help="Add a comment to a task")
    comment_p.add_argument("task_id", help="Task UUID")
    comment_p.add_argument("content", help="Comment content")
    comment_p.add_argument("--author", dest="author_name", help="Author name (optional)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Check for token
    if not get_auth_token():
        print("Warning: VIBE_API_TOKEN not set. Set it in .env or environment.", file=sys.stderr)

    commands = {
        "teams": cmd_teams,
        "projects": cmd_projects,
        "issues": cmd_issues,
        "create": cmd_create,
        "update": cmd_update,
        "task": cmd_task,
        "delete": cmd_delete,
        "move": cmd_move,
        "comments": cmd_comments,
        "comment": cmd_comment,
    }

    handler = commands.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
