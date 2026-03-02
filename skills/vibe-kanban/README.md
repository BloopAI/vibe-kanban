# Vibe Kanban Agent Skill

This directory contains the **Agent Skill** for managing tasks, projects, and development sessions using the `vibe-kanban` MCP server.

## Overview

The `vibe-kanban` skill enables an AI agent (like Cursor or Claude) to act as a project manager and automation engineer. It provides a bridge between the codebase and the Kanban/Session management infrastructure.

### Core Capabilities

- **Project Discovery**: Navigate the workspace hierarchy (Projects -> Repos -> Tasks).
- **Task Lifecycle**: Create, update, and track tickets directly from the chat.
- **Session Automation**: Launch dedicated development workspaces for specific tasks using `start_workspace_session`.

## Directory Structure

- `SKILL.md`: The primary instruction set for agents. Agents should read this file to understand the required tool call sequences.
- `references/hierarchy.md`: Explains the data model (Entity Relationship) of Projects, Repos, and Tasks.

## Installation

You can install this skill to your preferred agent using the [Agent Skills CLI](https://github.com/vercel-labs/skills):

```bash
# From the repository root
npx skills add . --skill vibe-kanban
```

Alternatively, you can install it globally from the GitHub repository:

```bash
npx skills add https://github.com/BloopAI/vibe-kanban/tree/main/skills/vibe-kanban -g
```

## How to Utilize

When an agent is tasked with a new feature or bug fix in this repository, it should:

1. **Read this skill**: `read_file skills/vibe-kanban/SKILL.md`.
2. **Find the task**: Use `list_tasks` to see if a ticket already exists.
3. **Start a session**: Use `start_workspace_session` to initialize the environment.

## MCP Tools Used

This skill leverages the MCP server of vibe-kanban, which includes tools such as:

- `list_projects`, `list_tasks`, `list_repos`
- `create_task`, `update_task`, `get_task`
- `start_workspace_session`
- `update_setup_script`, `update_dev_server_script`
