#!/usr/bin/env python3
"""
Vibe Kanban MCP Server - Task management for AI coding agents.

This MCP server provides tools for managing tasks and issues in vibe-kanban.
Based on vk-cli.py but exposed as an MCP server for Claude Code integration.

Tools available:
  - vk_list_teams: List all teams
  - vk_list_projects: List all projects
  - vk_list_issues: List issues for a team (with status filter)
  - vk_list_tasks: List tasks in a project
  - vk_get_task: Get task details
  - vk_create_issue: Create a new issue
  - vk_update_task: Update task status/title/description/priority/assignee/due_date
  - vk_delete_task: Delete a task
  - vk_move_task: Move task to another project
  - vk_list_comments: List comments for a task
  - vk_add_comment: Add a comment to a task
"""

import json
import sys
import os
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# ============================================================================
# CONFIGURATION - Synced with cli.py
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
    "backend": "use-dynamic-lookup",
    "integration": "use-dynamic-lookup",
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
    """Get the backend URL."""
    if os.environ.get("VIBE_BACKEND_URL"):
        return os.environ["VIBE_BACKEND_URL"]
    return "https://api.scho1ar.com"


def api_request(endpoint, method="GET", data=None):
    """Make an API request and return JSON response."""
    base_url = get_base_url()
    url = f"{base_url}/api{endpoint}"
    headers = {"Content-Type": "application/json"}

    auth_token = os.environ.get("VIBE_API_TOKEN")
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
        return {"success": False, "error": f"HTTP {e.code}: {msg}"}
    except URLError as e:
        return {"success": False, "error": f"Connection error: {e.reason}"}


def resolve_team_id(team_ref):
    """Resolve team name, identifier, or ID to actual ID (case-insensitive)."""
    if not team_ref:
        return None
    if team_ref in KNOWN_TEAMS:
        return KNOWN_TEAMS[team_ref]
    lower_ref = team_ref.lower()
    if lower_ref in KNOWN_TEAMS:
        return KNOWN_TEAMS[lower_ref]
    return team_ref  # Assume it's already a UUID


def resolve_project_id(project_ref, team_id=None):
    """Resolve project name or ID to actual ID."""
    if not project_ref:
        return TEAM_DEFAULT_PROJECTS.get(team_id) if team_id else None

    lower_ref = project_ref.lower()

    # Check team-specific projects
    if team_id == "a263e43f-43d3-4af7-a947-5f70e6670921":  # IKA
        if lower_ref in IKA_PROJECTS:
            proj_id = IKA_PROJECTS[lower_ref]
            if not proj_id.startswith("use-"):
                return proj_id
    elif team_id == "a2f22deb-901e-436b-9755-644cb26753b7":  # SCH
        if lower_ref in SCH_PROJECTS:
            return SCH_PROJECTS[lower_ref]

    return project_ref  # Assume it's a UUID


def get_default_project_for_team(team_id):
    """Get the default project ID for a team."""
    return TEAM_DEFAULT_PROJECTS.get(team_id)


def get_team_identifier(team_id):
    """Get the team identifier (IKA, SCH) from team ID."""
    for key, value in KNOWN_TEAMS.items():
        if value == team_id and len(key) == 3:
            return key.upper()
    return None


def parse_priority(priority_val):
    """Parse priority string or int to integer value."""
    if priority_val is None:
        return None
    if isinstance(priority_val, int):
        return priority_val
    if isinstance(priority_val, str):
        lower = priority_val.lower()
        if lower in PRIORITIES:
            return PRIORITIES[lower]
        try:
            return int(priority_val)
        except ValueError:
            return None
    return None


# ============================================================================
# MCP Tool Handlers
# ============================================================================

def handle_list_teams(params):
    """List all teams."""
    result = api_request("/teams")
    if result.get("success"):
        teams = result.get("data", [])
        return {
            "teams": [{
                "id": t["id"],
                "name": t["name"],
                "identifier": t.get("identifier"),
                "slug": t.get("slug"),
            } for t in teams],
            "count": len(teams)
        }
    return {"error": result.get("error", "Failed to fetch teams")}


def handle_list_projects(params):
    """List all projects."""
    result = api_request("/projects")
    if result.get("success"):
        projects = result.get("data", [])
        return {
            "projects": [{
                "id": p["id"],
                "name": p["name"],
                "description": p.get("description"),
            } for p in projects],
            "count": len(projects)
        }
    return {"error": result.get("error", "Failed to fetch projects")}


def handle_list_issues(params):
    """List issues for a team with optional status filter."""
    team = params.get("team", "IKA")
    team_id = resolve_team_id(team)
    status_filter = params.get("status")

    result = api_request(f"/teams/{team_id}/issues")
    if result.get("success"):
        issues = result.get("data", [])

        # Apply status filter if specified
        if status_filter:
            issues = [i for i in issues if i.get("status") == status_filter]

        team_identifier = get_team_identifier(team_id) or team

        return {
            "team": team_identifier,
            "issues": [{
                "id": i["id"],
                "issue_number": i.get("issue_number"),
                "issue_key": f"{team_identifier}-{i.get('issue_number')}" if i.get("issue_number") else None,
                "title": i["title"],
                "status": i["status"],
                "priority": i.get("priority"),
                "assignee_id": i.get("assignee_id"),
                "due_date": i.get("due_date"),
                "project_id": i.get("project_id"),
            } for i in issues],
            "count": len(issues)
        }
    return {"error": result.get("error", "Failed to fetch issues")}


def handle_list_tasks(params):
    """List tasks in a project."""
    project = params.get("project", "frontend")
    project_id = resolve_project_id(project)
    status = params.get("status")

    endpoint = f"/tasks?project_id={project_id}"
    if status:
        endpoint += f"&status={status}"

    result = api_request(endpoint)
    if result.get("success"):
        tasks = result.get("data", [])
        return {
            "tasks": [{
                "id": t["id"],
                "title": t["title"],
                "status": t["status"],
                "issue_number": t.get("issue_number"),
                "team_id": t.get("team_id"),
                "priority": t.get("priority"),
                "assignee_id": t.get("assignee_id"),
                "due_date": t.get("due_date"),
            } for t in tasks],
            "count": len(tasks)
        }
    return {"error": result.get("error", "Failed to fetch tasks")}


def handle_get_task(params):
    """Get details of a specific task."""
    task_id = params.get("task_id")
    if not task_id:
        return {"error": "task_id is required"}

    result = api_request(f"/tasks/{task_id}")
    if result.get("success"):
        task = result.get("data", {})
        team_id = task.get("team_id")
        team_identifier = get_team_identifier(team_id) if team_id else None
        issue_number = task.get("issue_number")

        return {
            "task": {
                **task,
                "issue_key": f"{team_identifier}-{issue_number}" if team_identifier and issue_number else None,
            }
        }
    return {"error": result.get("error", "Failed to fetch task")}


def handle_create_issue(params):
    """Create a new team issue."""
    title = params.get("title")
    team = params.get("team", "IKA")

    if not title:
        return {"error": "title is required"}

    team_id = resolve_team_id(team)

    # Get project: use specified project, or default for the team
    project = params.get("project")
    project_id = resolve_project_id(project, team_id)
    if not project_id:
        return {"error": f"No default project configured for team '{team}'. Please specify a project."}

    data = {
        "project_id": project_id,
        "title": title,
        "team_id": team_id,
        "status": params.get("status", "todo"),
    }

    if params.get("description"):
        data["description"] = params["description"]
    if params.get("priority") is not None:
        priority = parse_priority(params["priority"])
        if priority is not None:
            data["priority"] = priority
    if params.get("assignee_id"):
        data["assignee_id"] = params["assignee_id"]
    if params.get("due_date"):
        data["due_date"] = params["due_date"]

    result = api_request("/tasks", method="POST", data=data)
    if result.get("success"):
        task = result.get("data", {})
        team_identifier = get_team_identifier(team_id) or team
        issue_number = task.get("issue_number")

        return {
            "task_id": task.get("id"),
            "issue_number": issue_number,
            "issue_key": f"{team_identifier}-{issue_number}" if issue_number else None,
            "title": task.get("title"),
            "status": task.get("status"),
            "message": f"Created {team_identifier}-{issue_number}: {task.get('title')}"
        }
    return {"error": result.get("error", "Failed to create issue")}


def handle_update_task(params):
    """Update an existing task."""
    task_id = params.get("task_id")
    if not task_id:
        return {"error": "task_id is required"}

    data = {}
    if params.get("status"):
        data["status"] = params["status"]
    if params.get("title"):
        data["title"] = params["title"]
    if params.get("description") is not None:
        data["description"] = params["description"]
    if params.get("priority") is not None:
        priority = parse_priority(params["priority"])
        if priority is not None:
            data["priority"] = priority
    if params.get("assignee_id"):
        data["assignee_id"] = params["assignee_id"]
    if params.get("due_date"):
        data["due_date"] = params["due_date"]

    if not data:
        return {"error": "No updates provided. Specify status, title, description, priority, assignee_id, or due_date."}

    result = api_request(f"/tasks/{task_id}", method="PUT", data=data)
    if result.get("success"):
        task = result.get("data", {})
        return {
            "task_id": task.get("id"),
            "title": task.get("title"),
            "status": task.get("status"),
            "message": f"Updated task: {task.get('title')}"
        }
    return {"error": result.get("error", "Failed to update task")}


def handle_delete_task(params):
    """Delete a task."""
    task_id = params.get("task_id")
    if not task_id:
        return {"error": "task_id is required"}

    result = api_request(f"/tasks/{task_id}", method="DELETE")
    if result.get("success"):
        return {
            "deleted": True,
            "task_id": task_id,
            "message": f"Deleted task: {task_id}"
        }
    return {"error": result.get("error", "Failed to delete task")}


def handle_move_task(params):
    """Move a task to another project."""
    task_id = params.get("task_id")
    project_id = params.get("project_id")

    if not task_id:
        return {"error": "task_id is required"}
    if not project_id:
        return {"error": "project_id is required"}

    # Resolve project name to ID if needed
    resolved_project_id = resolve_project_id(project_id)

    data = {"project_id": resolved_project_id}
    result = api_request(f"/tasks/{task_id}/move", method="POST", data=data)

    if result.get("success"):
        task = result.get("data", {})
        return {
            "task_id": task.get("id"),
            "title": task.get("title"),
            "new_project_id": task.get("project_id"),
            "message": f"Moved task to project: {resolved_project_id}"
        }
    return {"error": result.get("error", "Failed to move task")}


def handle_list_comments(params):
    """List comments for a task."""
    task_id = params.get("task_id")
    if not task_id:
        return {"error": "task_id is required"}

    result = api_request(f"/tasks/{task_id}/comments")
    if result.get("success"):
        comments = result.get("data", [])
        return {
            "task_id": task_id,
            "comments": [{
                "id": c.get("id"),
                "content": c.get("content"),
                "author_name": c.get("author_name"),
                "created_at": c.get("created_at"),
            } for c in comments],
            "count": len(comments)
        }
    return {"error": result.get("error", "Failed to fetch comments")}


def handle_add_comment(params):
    """Add a comment to a task."""
    task_id = params.get("task_id")
    content = params.get("content")

    if not task_id:
        return {"error": "task_id is required"}
    if not content:
        return {"error": "content is required"}

    data = {"content": content}
    if params.get("author_name"):
        data["author_name"] = params["author_name"]

    result = api_request(f"/tasks/{task_id}/comments", method="POST", data=data)
    if result.get("success"):
        comment = result.get("data", {})
        return {
            "comment_id": comment.get("id"),
            "task_id": task_id,
            "content": comment.get("content"),
            "message": f"Added comment to task {task_id}"
        }
    return {"error": result.get("error", "Failed to add comment")}


# ============================================================================
# MCP Protocol Implementation
# ============================================================================

TOOLS = [
    {
        "name": "vk_list_teams",
        "description": "List all teams in vibe-kanban. Teams are the top-level organizational unit.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        }
    },
    {
        "name": "vk_list_projects",
        "description": "List all projects in vibe-kanban. Projects contain tasks and belong to teams.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        }
    },
    {
        "name": "vk_list_issues",
        "description": "List issues for a team. Issues appear on the team's kanban board. Use status filter to find issues in specific states.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "team": {
                    "type": "string",
                    "description": "Team identifier: IKA (iKanban), SCH (Schild), or team UUID. Default: IKA",
                    "default": "IKA"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"],
                    "description": "Filter by status (optional)"
                }
            },
        }
    },
    {
        "name": "vk_list_tasks",
        "description": "List tasks in a project. Tasks are work items that can be assigned and tracked.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "Project name (frontend, backend, integration) or UUID. Default: frontend",
                    "default": "frontend"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"],
                    "description": "Filter by status (optional)"
                }
            },
        }
    },
    {
        "name": "vk_get_task",
        "description": "Get detailed information about a specific task by ID. Returns all task fields including description, assignee, due date, etc.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID"
                }
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "vk_create_issue",
        "description": "Create a new team issue. Use this to create tasks that appear on the team kanban board. Returns the new issue ID and issue number (e.g., IKA-123).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Issue title (required)"
                },
                "team": {
                    "type": "string",
                    "description": "Team identifier: IKA (iKanban), SCH (Schild), or UUID. Default: IKA",
                    "default": "IKA"
                },
                "project": {
                    "type": "string",
                    "description": "Project name or UUID. Optional - uses team's default project if not specified"
                },
                "description": {
                    "type": "string",
                    "description": "Issue description (optional)"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"],
                    "description": "Initial status. Default: todo",
                    "default": "todo"
                },
                "priority": {
                    "type": ["integer", "string"],
                    "description": "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low (or use names: urgent, high, medium, low)"
                },
                "assignee_id": {
                    "type": "string",
                    "description": "Assignee user ID (optional)"
                },
                "due_date": {
                    "type": "string",
                    "description": "Due date in ISO format: YYYY-MM-DD (optional)"
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "vk_update_task",
        "description": "Update an existing task's status, title, description, priority, assignee, or due date. Only provided fields are updated.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID (required)"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"],
                    "description": "New status"
                },
                "title": {
                    "type": "string",
                    "description": "New title"
                },
                "description": {
                    "type": "string",
                    "description": "New description (empty string clears it)"
                },
                "priority": {
                    "type": ["integer", "string"],
                    "description": "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low (or use names)"
                },
                "assignee_id": {
                    "type": "string",
                    "description": "Assignee user ID"
                },
                "due_date": {
                    "type": "string",
                    "description": "Due date in ISO format: YYYY-MM-DD"
                }
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "vk_delete_task",
        "description": "Delete a task permanently. This action cannot be undone. All associated data (comments, links) will be deleted.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID to delete"
                }
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "vk_move_task",
        "description": "Move a task to a different project. Useful for reorganizing work between projects.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID to move"
                },
                "project_id": {
                    "type": "string",
                    "description": "Target project name or UUID"
                }
            },
            "required": ["task_id", "project_id"]
        }
    },
    {
        "name": "vk_list_comments",
        "description": "List all comments on a task. Comments are ordered by creation date.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID"
                }
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "vk_add_comment",
        "description": "Add a comment to a task. Useful for adding notes, updates, or context to tasks.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID"
                },
                "content": {
                    "type": "string",
                    "description": "Comment content (required)"
                },
                "author_name": {
                    "type": "string",
                    "description": "Author name (optional, for display purposes)"
                }
            },
            "required": ["task_id", "content"]
        }
    },
]

TOOL_HANDLERS = {
    "vk_list_teams": handle_list_teams,
    "vk_list_projects": handle_list_projects,
    "vk_list_issues": handle_list_issues,
    "vk_list_tasks": handle_list_tasks,
    "vk_get_task": handle_get_task,
    "vk_create_issue": handle_create_issue,
    "vk_update_task": handle_update_task,
    "vk_delete_task": handle_delete_task,
    "vk_move_task": handle_move_task,
    "vk_list_comments": handle_list_comments,
    "vk_add_comment": handle_add_comment,
}


def send_response(response):
    """Send a JSON-RPC response."""
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def handle_request(request):
    """Handle a JSON-RPC request."""
    method = request.get("method")
    params = request.get("params", {})
    request_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "vibe-kanban",
                    "version": "2.0.0"
                }
            }
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "tools": TOOLS
            }
        }

    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})

        handler = TOOL_HANDLERS.get(tool_name)
        if handler:
            try:
                result = handler(tool_args)
                return {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result, indent=2)
                            }
                        ]
                    }
                }
            except Exception as e:
                return {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32000,
                        "message": str(e)
                    }
                }
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32601,
                    "message": f"Unknown tool: {tool_name}. Available tools: {', '.join(TOOL_HANDLERS.keys())}"
                }
            }

    elif method == "notifications/initialized":
        # No response needed for notifications
        return None

    else:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}"
            }
        }


def main():
    """Main MCP server loop."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            response = handle_request(request)
            if response:
                send_response(response)
        except json.JSONDecodeError as e:
            send_response({
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32700,
                    "message": f"Parse error: {e}"
                }
            })


if __name__ == "__main__":
    main()
