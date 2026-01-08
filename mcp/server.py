#!/usr/bin/env python3
"""
Vibe Kanban MCP Server - Task management for AI coding agents.

This MCP server provides tools for managing tasks and issues in vibe-kanban.
Based on vk-cli.py but exposed as an MCP server for Claude Code integration.
"""

import json
import sys
import os
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Configuration
DEFAULT_PORT = 3003
DEFAULT_HOST = "127.0.0.1"

KNOWN_PROJECTS = {
    "frontend": "ba7fe592-42d0-43f5-add8-f653054c2944",
    "backend": "de246043-3b27-45e4-bd7a-f0d685b317d0",
    "integration": "bde6ec12-2cf1-4784-9a0e-d03308ade450",
    "database": "731d6e37-9223-4595-93a0-412a38af4540",
    "ai": "ffa3f7db-bf84-4e88-b04d-59f5f98a0522",
}

KNOWN_TEAMS = {
    "vibe-kanban": "c1a926de-0683-407d-81de-124e0d161ec5",
    "ikanban": "a263e43f-43d3-4af7-a947-5f70e6670921",
    "schild": "a2f22deb-901e-436b-9755-644cb26753b7",
}


def get_base_url():
    """Get the backend URL."""
    # Use remote production API by default for data consistency
    if os.environ.get("VIBE_BACKEND_URL"):
        return os.environ["VIBE_BACKEND_URL"]

    # Default to remote production API
    return "https://api.scho1ar.com"


def api_request(endpoint, method="GET", data=None):
    """Make an API request and return JSON response."""
    base_url = get_base_url()
    url = f"{base_url}/api{endpoint}"
    headers = {"Content-Type": "application/json"}

    # Add authorization token if available
    auth_token = os.environ.get("VIBE_API_TOKEN")
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        if data:
            body = json.dumps(data).encode("utf-8")
            req = Request(url, data=body, headers=headers, method=method)
        else:
            req = Request(url, headers=headers, method=method)

        with urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as e:
        return {"success": False, "error": str(e)}


def resolve_project_id(project_ref):
    """Resolve project name or ID to actual ID."""
    return KNOWN_PROJECTS.get(project_ref, project_ref)


def resolve_team_id(team_ref):
    """Resolve team name or ID to actual ID."""
    return KNOWN_TEAMS.get(team_ref, team_ref)


# MCP Tool Handlers

def handle_list_teams(params):
    """List all teams."""
    result = api_request("/teams")
    if result.get("success"):
        teams = result.get("data", [])
        return {"teams": [{"id": t["id"], "name": t["name"], "identifier": t.get("identifier")} for t in teams]}
    return {"error": result.get("error", "Failed to fetch teams")}


def handle_list_projects(params):
    """List all projects."""
    result = api_request("/projects")
    if result.get("success"):
        projects = result.get("data", [])
        return {"projects": [{"id": p["id"], "name": p["name"]} for p in projects]}
    return {"error": result.get("error", "Failed to fetch projects")}


def handle_list_issues(params):
    """List issues for a team."""
    team_id = resolve_team_id(params.get("team", "vibe-kanban"))
    result = api_request(f"/teams/{team_id}/issues")
    if result.get("success"):
        issues = result.get("data", [])
        return {
            "issues": [{
                "id": i["id"],
                "issue_number": i.get("issue_number"),
                "title": i["title"],
                "status": i["status"],
                "project_id": i.get("project_id"),
                "priority": i.get("priority"),
                "assignee_id": i.get("assignee_id"),
            } for i in issues],
            "count": len(issues)
        }
    return {"error": result.get("error", "Failed to fetch issues")}


def handle_list_tasks(params):
    """List tasks in a project."""
    project_id = resolve_project_id(params.get("project", "frontend"))
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
        return {"task": result.get("data")}
    return {"error": result.get("error", "Failed to fetch task")}


def handle_create_issue(params):
    """Create a new team issue."""
    project = params.get("project", "frontend")
    title = params.get("title")
    team = params.get("team", "vibe-kanban")

    if not title:
        return {"error": "title is required"}

    data = {
        "project_id": resolve_project_id(project),
        "title": title,
        "team_id": resolve_team_id(team),
        "status": params.get("status", "todo"),
    }

    if params.get("description"):
        data["description"] = params["description"]
    if params.get("priority"):
        data["priority"] = params["priority"]
    if params.get("assignee_id"):
        data["assignee_id"] = params["assignee_id"]

    result = api_request("/tasks", method="POST", data=data)
    if result.get("success"):
        task = result.get("data", {})
        return {
            "task_id": task.get("id"),
            "issue_number": task.get("issue_number"),
            "title": task.get("title"),
            "status": task.get("status"),
            "message": f"Created issue #{task.get('issue_number')}: {task.get('title')}"
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
    if params.get("description"):
        data["description"] = params["description"]
    if params.get("priority") is not None:
        data["priority"] = params["priority"]
    if params.get("assignee_id"):
        data["assignee_id"] = params["assignee_id"]

    if not data:
        return {"error": "No updates provided"}

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


# MCP Protocol Implementation

TOOLS = [
    {
        "name": "vk_list_teams",
        "description": "List all teams in vibe-kanban",
        "inputSchema": {
            "type": "object",
            "properties": {},
        }
    },
    {
        "name": "vk_list_projects",
        "description": "List all projects in vibe-kanban",
        "inputSchema": {
            "type": "object",
            "properties": {},
        }
    },
    {
        "name": "vk_list_issues",
        "description": "List issues for a team. Issues appear on the team's kanban board.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "team": {
                    "type": "string",
                    "description": "Team name or ID (default: vibe-kanban)",
                    "default": "vibe-kanban"
                }
            },
        }
    },
    {
        "name": "vk_list_tasks",
        "description": "List tasks in a project",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "string",
                    "description": "Project name (frontend, backend, integration) or ID",
                    "default": "frontend"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"],
                    "description": "Filter by status"
                }
            },
        }
    },
    {
        "name": "vk_get_task",
        "description": "Get details of a specific task by ID",
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
        "description": "Create a new team issue. Use this to create tasks that appear on the team kanban board.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Issue title"
                },
                "project": {
                    "type": "string",
                    "description": "Project name (frontend, backend, integration) or ID",
                    "default": "frontend"
                },
                "team": {
                    "type": "string",
                    "description": "Team name or ID (default: vibe-kanban)",
                    "default": "vibe-kanban"
                },
                "description": {
                    "type": "string",
                    "description": "Issue description"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"],
                    "default": "todo"
                },
                "priority": {
                    "type": "integer",
                    "description": "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low"
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "vk_update_task",
        "description": "Update an existing task's status, title, description, or priority",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task UUID"
                },
                "status": {
                    "type": "string",
                    "enum": ["todo", "inprogress", "inreview", "done", "cancelled"]
                },
                "title": {
                    "type": "string"
                },
                "description": {
                    "type": "string"
                },
                "priority": {
                    "type": "integer",
                    "description": "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low"
                }
            },
            "required": ["task_id"]
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
                    "version": "1.0.0"
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
                    "message": f"Unknown tool: {tool_name}"
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
