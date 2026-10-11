---
name: vibe-kanban
description: Manage projects, tasks, and development sessions using the vibe-kanban MCP server. Use this to discover projects, create/update tasks, and launch workspace sessions.
---

# Vibe Kanban Skill

This skill provides a structured workflow for leveraging the `vibe-kanban` MCP tools to manage the development lifecycle, from task discovery to workspace execution.

## When to Use

- When you need to see what projects or tasks are available.
- When creating a new task or ticket for a feature or bug fix.
- When you are ready to start working on a specific task and need to launch a development session.
- When you need to update repository automation scripts (setup, cleanup, dev server).

## Instructions

### 1. Context Discovery

Before performing any task or session management, you must identify the correct project and repository.

1. Call `list_projects` to find the relevant `project_id`.
2. Call `list_repos` with the `project_id` to identify the `repo_id`s involved in the project.
3. Use `get_repo` to inspect current automation scripts if environment setup is required.

### 2. Task Management

Maintain the Kanban board by keeping tasks up to date.

- **Listing**: Use `list_tasks` with `project_id` and optional `status` filters to see the current workload.
- **Creation**: When starting a new piece of work, use `create_task` with a clear title and description.
- **Refinement**: Use `get_task` to read full details of an existing ticket.
- **Progress**: Use `update_task` to transition tasks through states: `todo` → `inprogress` → `inreview` → `done`.

### 3. Session Automation (The "Start Task" Flow)

To start a development session for a task:

1. Ensure you have the `task_id` (from `list_tasks` or `create_task`).
2. Identify the target repositories and their base branches (usually `main` or `master`).
3. Call `start_workspace_session` with:
   - `task_id`
   - `executor`: Typically `CURSOR_AGENT` or `CLAUDE_CODE`.
   - `repos`: An array of objects with `repo_id` and `base_branch`.

## References

- See [references/hierarchy.md](references/hierarchy.md) for an explanation of how Projects, Repos, and Tasks relate.
