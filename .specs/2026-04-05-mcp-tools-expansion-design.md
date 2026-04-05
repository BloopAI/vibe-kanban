# MCP Server Tools Expansion

## Problem

The Vibe Kanban MCP server exposes 34 tools but the local backend has ~100+ API endpoints. **External agents** (Claude Code, Cursor, Amp, etc.) calling into Vibe Kanban via the MCP server are missing key capabilities:

1. **Cannot create pull requests** — the most critical gap. After finishing work, external agents have no way to open a PR or attach it to the workspace through the MCP interface.
2. **Cannot update issue status** — `update_issue` exists but agents don't know valid status names. There is no `list_project_statuses` tool, so the agent guesses and fails.
3. **No git operations** — external agents can't check branch status or push before creating PRs.
4. **No execution control** — external agents can't stop hung processes.
5. **No branch discovery** — external agents can't list branches when setting up workspaces.
6. **No project tag management** — external agents can create/list issues but can't manage project-level tags (bug, feature, documentation, etc.) used to label issues.

## Scope

10 new MCP tools + 3 new local server proxy routes + 1 improved description. No changes to existing tool behavior.

### New Tools

#### PR & Git (3 tools)

**`create_pull_request`**

- Description: "Create a pull request from a workspace branch. Automatically pushes the branch to the remote before creating the PR. Returns the PR URL on success. Use `git_status` first to verify there are no uncommitted changes. `workspace_id` is optional if running inside that workspace context."
- Backend: `POST /api/workspaces/{id}/pull-requests`
- Params:
  - `workspace_id` (optional in context) — Workspace ID. Optional if running inside that workspace context.
  - `repo_id` (required) — Repository ID to create the PR for. Use `list_repos` to find repo IDs.
  - `title` (required) — Pull request title.
  - `body` (optional) — PR description body. Supports markdown.
  - `draft` (optional) — Create as a draft PR (default: false).
  - `target_branch` (optional) — Target branch to merge into. Defaults to the repo's default target branch.
- Response: `{ pr_url: string }`
- Errors: `cli_not_installed`, `cli_not_logged_in`, `target_branch_not_found`, `unsupported_provider`
- Notes: Set `auto_generate_description: false` — the agent writes the PR description itself via the `body` param. The backend handles pushing the branch before creating the PR.

**`git_status`**

- Description: "Get the git branch status for all repositories in a workspace. Returns ahead/behind commit counts relative to the target branch, uncommitted change counts, and whether a rebase or merge conflict is in progress. Useful before creating a pull request or pushing. `workspace_id` is optional if running inside that workspace context."
- Backend: `GET /api/workspaces/{id}/git/status`
- Params:
  - `workspace_id` (optional in context) — Workspace ID. Optional if running inside that workspace context.
- Response: Array of per-repo status objects with: `repo_id`, `repo_name`, `target_branch_name`, `commits_ahead`, `commits_behind`, `has_uncommitted_changes`, `uncommitted_count`, `untracked_count`, `is_rebase_in_progress`, `conflicted_files`

**`git_push`**

- Description: "Push a workspace branch to its remote. Returns success or a 'force_push_required' error if the remote has diverged. Use `git_status` first to check for uncommitted changes. `workspace_id` is optional if running inside that workspace context."
- Backend: `POST /api/workspaces/{id}/git/push`
- Params:
  - `workspace_id` (optional in context) — Workspace ID. Optional if running inside that workspace context.
  - `repo_id` (required) — Repository ID to push. Use `list_repos` to find repo IDs.
- Response: `{ success: true }` or error `{ type: "force_push_required" }`

#### Execution & Workspace (3 tools)

**`stop_execution`**

- Description: "Stop a running execution process (coding agent, setup script, dev server, etc.). Use `get_execution` to check if a process is still running before stopping it."
- Backend: `POST /api/execution-processes/{id}/stop`
- Params:
  - `execution_id` (required) — The execution process ID to stop.
- Response: `{ success: true }`

**`list_branches`**

- Description: "List all branches for a repository, including whether each is the current branch, whether it's a remote-tracking branch, and the last commit date. Useful for choosing a branch when creating a workspace with `start_workspace`."
- Backend: `GET /api/repos/{id}/branches`
- Params:
  - `repo_id` (required) — Repository ID. Use `list_repos` to find repo IDs.
- Response: Array of `{ name, is_current, is_remote, last_commit_date }`

**`get_workspace`**

- Description: "Get detailed information about a single workspace including its branch name, archived/pinned state, and timestamps. `workspace_id` is optional if running inside that workspace context."
- Backend: `GET /api/workspaces/{id}`
- Params:
  - `workspace_id` (optional in context) — Workspace ID. Optional if running inside that workspace context.
- Response: Full workspace object: `{ id, branch, name, archived, pinned, setup_completed_at, created_at, updated_at }`

#### Project Tags (3 tools)

Project-level tags (e.g. "bug", "feature", "documentation") are used to label issues. The MCP server already has `list_tags`, `add_issue_tag`, and `remove_issue_tag` — but cannot create, update, or delete the tag definitions themselves.

The local backend currently only proxies `list` and `get` for tags. Create/update/delete need new proxy routes in `crates/server/src/routes/remote/tags.rs` before MCP tools can call them.

**`create_tag`**

- Description: "Create a new project tag for labeling issues (e.g. 'bug', 'feature', 'documentation'). Use `list_tags` to see existing tags. `project_id` is optional if running inside a workspace linked to a remote project."
- Backend: `POST /api/remote/tags` (new proxy route → remote `POST /v1/tags`)
- Params:
  - `project_id` (optional in context) — Project ID. Optional if running inside a workspace linked to a remote project.
  - `name` (required) — Tag name (e.g. 'bug', 'feature', 'documentation').
  - `color` (required) — Tag color as a hex string (e.g. '#ef4444').
- Response: `{ id, project_id, name, color }`

**`update_tag`**

- Description: "Update a project tag's name or color. Use `list_tags` to find tag IDs."
- Backend: `PUT /api/remote/tags/{tag_id}` (new proxy route → remote `PUT /v1/tags/{tag_id}`)
- Params:
  - `tag_id` (required) — The tag ID to update.
  - `name` (optional) — New tag name.
  - `color` (optional) — New tag color as a hex string.
- Response: `{ id, project_id, name, color }`

**`delete_tag`**

- Description: "Delete a project tag. This removes the tag definition — it will no longer appear on any issues. Use `list_tags` to find tag IDs."
- Backend: `DELETE /api/remote/tags/{tag_id}` (new proxy route → remote `DELETE /v1/tags/{tag_id}`)
- Params:
  - `tag_id` (required) — The tag ID to delete.
- Response: `{ success: true }`

#### Status Discovery (1 tool)

**`list_project_statuses`**

- Description: "List all available statuses for a project (e.g. 'Backlog', 'Todo', 'In Progress', 'Done'). Use this to discover valid status names before calling `update_issue` with a status change. `project_id` is optional if running inside a workspace linked to a remote project."
- Backend: `GET /api/remote/project-statuses?project_id={id}`
- Params:
  - `project_id` (optional in context) — Project ID. Optional if running inside a workspace linked to a remote project.
- Response: Array of `{ id, name, color, sort_order }`

### Improved Existing Description

**`update_issue`** — change the `#[tool(description)]` from:

> "Update an existing issue's title, description, or status. `issue_id` is required. `title`, `description`, and `status` are optional."

To:

> "Update an existing issue's title, description, status, or priority. `issue_id` is required; all other fields are optional. To change status, pass the status name as a string (e.g. 'In Progress', 'Done') — use `list_project_statuses` to discover valid names for the project. To change priority, pass one of: 'urgent', 'high', 'medium', 'low'."

## Tool Router Registration

All 10 new tools register in the **global mode** router. For **orchestrator mode**:

- `git_status`, `git_push`, `create_pull_request`, `get_workspace` — add to orchestrator (agents in scoped sessions need these to ship work)
- `stop_execution` — already has `get_execution` in orchestrator, add `stop_execution` too
- `list_branches`, project tag tools, `list_project_statuses` — global only (orchestrator sessions don't need these)

## File Organization

### New proxy routes in local server

Add create/update/delete for project tags in `crates/server/src/routes/remote/tags.rs`:

| Route | Handler | Remote endpoint |
|-------|---------|----------------|
| `POST /api/remote/tags` | `create_tag` | `POST /v1/tags` |
| `PUT /api/remote/tags/{tag_id}` | `update_tag` | `PUT /v1/tags/{tag_id}` |
| `DELETE /api/remote/tags/{tag_id}` | `delete_tag` | `DELETE /v1/tags/{tag_id}` |

Follow the exact same pattern as `crates/server/src/routes/remote/issue_tags.rs` (which already proxies create/delete for issue-tag relations).

### New MCP tool files in `crates/mcp/src/task_server/tools/`:

| File | Tools |
|------|-------|
| `pull_requests.rs` | `create_pull_request` |
| `git.rs` | `git_status`, `git_push` |

### Existing MCP files modified:

| File | Changes |
|------|---------|
| `sessions.rs` | Add `stop_execution` |
| `repos.rs` | Add `list_branches` |
| `workspaces.rs` | Add `get_workspace` |
| `remote_issues.rs` | Improve `update_issue` description, add `list_project_statuses` |
| `issue_tags.rs` | Add `create_tag`, `update_tag`, `delete_tag` |
| `mod.rs` | Register new routers in `global_mode_router()` and `orchestrator_mode_router()` |

## Documentation Updates

Update `docs/integrations/vibe-kanban-mcp-server.mdx` with:

- New tools added to the tool reference table
- Updated tool count (34 → 44 global, 7 → 12 orchestrator)
- Updated `update_issue` description in the docs

## Out of Scope

- WebSocket streaming tools (MCP doesn't support streaming)
- Auth/config/relay/migration endpoints (internal to app)
- Attachments (complex multi-step upload flow)
- Scratch pads (internal UI state)
- Local content tags (`/api/tags` — `@tagname` snippets, not issue labels)
- `git_merge`, `git_rebase`, `change_target_branch` (human-driven operations)
- `get_pull_request_info`, `list_pull_requests` (can add later if needed)
