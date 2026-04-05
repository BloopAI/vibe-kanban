# MCP Server Tools Expansion

## Problem

The Vibe Kanban MCP server exposes 34 tools but the local backend has ~100+ API endpoints. Key agent workflows are broken or missing:

1. **Agents cannot create pull requests** — the most critical gap. After finishing work, agents have no way to open a PR or attach it to the workspace.
2. **Agents cannot update issue status** — `update_issue` exists but agents don't know valid status names. There is no `list_project_statuses` tool, so the agent guesses and fails.
3. **No git operations** — agents can't check branch status or push before creating PRs.
4. **No execution control** — agents can't stop hung processes.
5. **No branch discovery** — agents can't list branches when setting up workspaces.
6. **No local tag management** — agents can't CRUD local content tags (the `@tagname` snippets).

## Scope

11 new tools + 1 improved description. No changes to existing tool behavior.

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

#### Local Tags (4 tools)

**`list_local_tags`**

- Description: "List local content tags (reusable text snippets that can be referenced with @tagname in issue descriptions). These are different from issue tags — local tags store content like prompt templates or shared context."
- Backend: `GET /api/tags?search={q}`
- Params:
  - `search` (optional) — Search string to filter tags by name (case-insensitive substring match).
- Response: Array of `{ id, tag_name, content, created_at, updated_at }`

**`create_local_tag`**

- Description: "Create a local content tag. Tags can be referenced in issue descriptions using @tagname syntax and will be expanded to their content automatically."
- Backend: `POST /api/tags`
- Params:
  - `tag_name` (required) — Name for the tag (used as @tagname in references).
  - `content` (required) — The text content of the tag.
- Response: `{ id, tag_name, content }`

**`update_local_tag`**

- Description: "Update an existing local content tag's name or content. Use `list_local_tags` to find tag IDs."
- Backend: `PUT /api/tags/{id}`
- Params:
  - `tag_id` (required) — The tag ID to update.
  - `tag_name` (optional) — New name for the tag.
  - `content` (optional) — New content for the tag.
- Response: `{ id, tag_name, content }`

**`delete_local_tag`**

- Description: "Delete a local content tag. Use `list_local_tags` to find tag IDs."
- Backend: `DELETE /api/tags/{id}`
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

All 11 new tools register in the **global mode** router. For **orchestrator mode**:

- `git_status`, `git_push`, `create_pull_request`, `get_workspace` — add to orchestrator (agents in scoped sessions need these to ship work)
- `stop_execution` — already has `get_execution` in orchestrator, add `stop_execution` too
- `list_branches`, local tag tools, `list_project_statuses` — global only (orchestrator sessions don't need these)

## File Organization

New files in `crates/mcp/src/task_server/tools/`:

| File | Tools |
|------|-------|
| `pull_requests.rs` | `create_pull_request` |
| `git.rs` | `git_status`, `git_push` |
| `local_tags.rs` | `list_local_tags`, `create_local_tag`, `update_local_tag`, `delete_local_tag` |

Existing files modified:

| File | Changes |
|------|---------|
| `sessions.rs` | Add `stop_execution` |
| `repos.rs` | Add `list_branches` |
| `workspaces.rs` | Add `get_workspace` |
| `remote_issues.rs` | Improve `update_issue` description, add `list_project_statuses` |
| `mod.rs` | Register new routers in `global_mode_router()` and `orchestrator_mode_router()` |

## Documentation Updates

Update `docs/integrations/vibe-kanban-mcp-server.mdx` with:

- New tools added to the tool reference table
- Updated tool count (34 → 45 global, 7 → 12 orchestrator)
- Updated `update_issue` description in the docs

## Out of Scope

- WebSocket streaming tools (MCP doesn't support streaming)
- Auth/config/relay/migration endpoints (internal to app)
- Attachments (complex multi-step upload flow)
- Scratch pads (internal UI state)
- `git_merge`, `git_rebase`, `change_target_branch` (human-driven operations)
- `get_pull_request_info`, `list_pull_requests` (can add later if needed)
