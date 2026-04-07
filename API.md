# Vibe Kanban Client API Reference

Self-contained documentation of every HTTP and WebSocket call made by the Vibe Kanban frontend.
No external file references — all request/response shapes are defined inline.

## Transport Layer

Two request transports:

| Transport | Base | Auth |
|-----------|------|------|
| **Local API** | `/api/...` | Cookie / relay signature |
| **Remote API** | `{REMOTE_API_BASE}/v1/...` | Bearer token (auto-refresh on 401) |

All local API responses are wrapped:

```ts
{ success: boolean, data: T, message?: string, error_data?: E }
```

Result-style endpoints return:

```ts
type Ok<T> = { success: true, data: T }
type Err<E> = { success: false, error: E | undefined, message?: string }
```

Remote API responses are raw JSON (no wrapper).

---

## Sessions

### List sessions for workspace

```
GET /api/sessions?workspace_id={id}
```

**Response:** `Session[]`

### Get session by ID

```
GET /api/sessions/{sessionId}
```

**Response:** `Session`

### Create session

```
POST /api/sessions
```

**Request body:**

```ts
{
  workspace_id: string
  executor?: string       // agent type (e.g. "claude_code", "cursor_agent")
  name?: string
}
```

**Response:** `Session`

### Update session

```
PUT /api/sessions/{sessionId}
```

**Request body:**

```ts
{ name?: string }
```

**Response:** `Session`

### Send follow-up prompt

```
POST /api/sessions/{sessionId}/follow-up
```

**Request body:**

```ts
{
  prompt: string
  executor_config: ExecutorConfig
  retry_process_id: string | null
  force_when_dirty: boolean | null
  perform_git_reset: boolean | null
}
```

**Response:** `ExecutionProcess`

### Start PR review

```
POST /api/sessions/{sessionId}/review
```

**Request body:**

```ts
{
  executor_config: ExecutorConfig
  additional_prompt: string | null
  use_all_workspace_commits: boolean
}
```

**Response:** `ExecutionProcess`

**Error type:**

```ts
{ type: "process_already_running" }
```

### Reset to previous process

```
POST /api/sessions/{sessionId}/reset
```

**Request body:**

```ts
{
  process_id: string
  force_when_dirty: boolean | null
  perform_git_reset: boolean | null
}
```

**Response:** `void`

### Run setup script

```
POST /api/sessions/{sessionId}/setup
```

**Response:** `Result<ExecutionProcess, RunScriptError>`

**Error type:**

```ts
{ type: "no_script_configured" } | { type: "process_already_running" }
```

---

## Workspaces

### Create and start workspace

```
POST /api/workspaces/start
```

This is the primary workspace creation endpoint. It creates the workspace, links repos, optionally links an issue, and starts the first agent session.

**Request body:**

```ts
{
  name: string | null
  repos: Array<{
    repo_id: string
    target_branch?: string
  }>
  linked_issue: {
    project_id: string
    issue_id: string
  } | null
  executor_config: ExecutorConfig
  prompt: string
  attachment_ids: Array<string> | null
}
```

**Response:**

```ts
{
  workspace: Workspace
  execution_process: ExecutionProcess
}
```

### List all workspaces

```
GET /api/workspaces
```

**Response:** `Workspace[]` (newest first)

### List workspaces by task

```
GET /api/workspaces?task_id={id}
```

**Response:** `Workspace[]`

### Get workspace

```
GET /api/workspaces/{id}
```

**Response:** `Workspace`

### Update workspace

```
PUT /api/workspaces/{id}
```

**Request body:**

```ts
{
  archived?: boolean
  pinned?: boolean
  name?: string
}
```

**Response:** `Workspace`

### Delete workspace

```
DELETE /api/workspaces/{id}?delete_branches={bool}
```

**Response:** `void`

### Mark workspace as seen

```
PUT /api/workspaces/{id}/seen
```

**Response:** `void`

### Get first user message

```
GET /api/workspaces/{id}/messages/first
```

**Response:** `string | null`

### Link workspace to issue

```
POST /api/workspaces/{id}/links
```

**Request body:**

```ts
{
  project_id: string
  issue_id: string
}
```

**Response:** `void`

### Unlink workspace from issue

```
DELETE /api/workspaces/{id}/links
```

**Response:** `void`

### Get workspace repos

```
GET /api/workspaces/{id}/repos
```

**Response:** `RepoWithTargetBranch[]`

### Create workspace from PR

```
POST /api/workspaces/from-pr
```

**Request body:**

```ts
{
  repo_id: string
  pr_number: number
  pr_title: string
  pr_url: string
  head_branch: string
  base_branch: string
  run_setup: boolean
  remote_name: string | null
}
```

**Response:** `Result<{ workspace: Workspace }, CreateFromPrError>`

**Error variants:**

```ts
{ type: "branch_fetch_failed" }
| { type: "auth_failed" }
| { type: "cli_not_installed" }
| { type: "pr_not_found" }
| { type: "unsupported_provider" }
```

---

## Workspace Integration & Setup

### Run agent setup

```
POST /api/workspaces/{id}/integration/agent/setup
```

**Request body:**

```ts
{
  executor_profile_id: string
}
```

**Response:** `{}` (empty object)

### Open workspace in editor

```
POST /api/workspaces/{id}/integration/editor/open
```

**Request body:**

```ts
{
  editor_type: string | null
  file_path: string | null
}
```

**Response:**

```ts
{ url: string | null }
```

### Get workspace editor path

```
GET /api/workspaces/{id}/integration/editor/path
```

**Response:**

```ts
{ workspace_path: string }
```

### Setup GitHub CLI

```
POST /api/workspaces/{id}/integration/github/cli/setup
```

**Response:** `ExecutionProcess`

**Error type:**

```ts
"BREW_MISSING" | "SETUP_HELPER_NOT_SUPPORTED" | { OTHER: { message: string } }
```

---

## Workspace Execution & Scripts

### Start dev server

```
POST /api/workspaces/{id}/execution/dev-server/start
```

**Response:** `ExecutionProcess[]`

### Run cleanup script

```
POST /api/workspaces/{id}/execution/cleanup
```

**Response:** `Result<ExecutionProcess, RunScriptError>`

### Run archive script

```
POST /api/workspaces/{id}/execution/archive
```

**Response:** `Result<ExecutionProcess, RunScriptError>`

### Stop workspace execution

```
POST /api/workspaces/{id}/execution/stop
```

**Response:** `void`

---

## Git Operations (Workspace-scoped)

### Get branch status

```
GET /api/workspaces/{id}/git/status
```

**Response:** `RepoBranchStatus[]`

```ts
{
  repo_id: string
  repo_name: string
  commits_behind: number | null
  commits_ahead: number | null
  has_uncommitted_changes: boolean | null
  head_oid: string | null
  uncommitted_count: number | null
  untracked_count: number | null
  target_branch_name: string
  remote_commits_behind: number | null
  remote_commits_ahead: number | null
  merges: Array<Merge>
  is_rebase_in_progress: boolean
  conflict_op: ConflictOp | null
  conflicted_files: Array<string>
  is_target_remote: boolean
}
```

### Merge workspace

```
POST /api/workspaces/{id}/git/merge
```

**Request body:**

```ts
{ repo_id: string }
```

**Response:** `void`

### Push workspace

```
POST /api/workspaces/{id}/git/push
```

**Request body:**

```ts
{ repo_id: string }
```

**Response:** `Result<void, PushError>`

**Error type:**

```ts
{ type: "force_push_required" }
```

### Force push workspace

```
POST /api/workspaces/{id}/git/push/force
```

**Request body:**

```ts
{ repo_id: string }
```

**Response:** `Result<void, PushError>`

### Rebase workspace

```
POST /api/workspaces/{id}/git/rebase
```

**Request body:**

```ts
{
  repo_id: string
  old_base_branch: string | null
  new_base_branch: string | null
}
```

**Response:** `Result<void, GitOperationError>`

**Error type:**

```ts
{ type: "merge_conflicts", message: string, op: ConflictOp, conflicted_files: Array<string>, target_branch: string }
| { type: "rebase_in_progress" }
```

### Continue rebase

```
POST /api/workspaces/{id}/git/rebase/continue
```

**Request body:**

```ts
{ repo_id: string }
```

**Response:** `void`

### Abort conflicts

```
POST /api/workspaces/{id}/git/conflicts/abort
```

**Request body:**

```ts
{ repo_id: string }
```

**Response:** `void`

### Change target branch

```
PUT /api/workspaces/{id}/git/target-branch
```

**Request body:**

```ts
{
  repo_id: string
  new_target_branch: string
}
```

**Response:**

```ts
{
  repo_id: string
  new_target_branch: string
  status: [number, number]
}
```

### Rename workspace branch

```
PUT /api/workspaces/{id}/git/branch
```

**Request body:**

```ts
{ new_branch_name: string }
```

**Response:**

```ts
{ branch: string }
```

---

## Pull Requests

### Create PR from workspace

```
POST /api/workspaces/{id}/pull-requests
```

**Request body:**

```ts
{
  title: string
  body: string | null
  target_branch: string | null
  draft: boolean | null
  repo_id: string
  auto_generate_description: boolean
}
```

**Response:** `Result<string, PrError>` (string is the PR URL)

**Error type:**

```ts
{ type: "cli_not_installed", provider: ProviderKind }
| { type: "cli_not_logged_in", provider: ProviderKind }
| { type: "git_cli_not_logged_in" }
| { type: "git_cli_not_installed" }
| { type: "target_branch_not_found", branch: string }
| { type: "unsupported_provider" }
```

### Attach existing PR to workspace

```
POST /api/workspaces/{id}/pull-requests/attach
```

**Request body:**

```ts
{ repo_id: string }
```

**Response:** `Result<AttachPrResponse, PrError>`

```ts
{
  pr_attached: boolean
  pr_url: string | null
  pr_number: number | null
  pr_status: MergeStatus | null  // "open" | "merged" | "closed"
}
```

### Get PR comments

```
GET /api/workspaces/{id}/pull-requests/comments?repo_id={repoId}
```

**Response:**

```ts
{ comments: Array<UnifiedPrComment> }
```

### Get PR info from URL

```
GET /api/repos/pr-info?url={url}
```

**Response:** `Result<PullRequestDetail, ListPrsError>`

```ts
// PullRequestDetail:
{
  number: number
  url: string
  status: MergeStatus
  merged_at: string | null
  merge_commit_sha: string | null
  title: string
  base_branch: string
  head_branch: string
}
```

**Error type:**

```ts
{ type: "cli_not_installed", provider: ProviderKind }
| { type: "auth_failed", message: string }
| { type: "unsupported_provider" }
```

### Link PR to remote issue

```
POST /api/remote/pull-requests/link
```

**Request body:**

```ts
{
  pr_url: string
  pr_number: number
  base_branch: string
}
```

**Response:** `void`

### List open PRs for repo

```
GET /api/repos/{repoId}/prs?remote={remoteName}
```

**Response:** `Result<PullRequestDetail[], ListPrsError>`

---

## Execution Processes

### Get execution process details

```
GET /api/execution-processes/{id}
```

**Response:** `ExecutionProcess`

### Get execution repo states

```
GET /api/execution-processes/{id}/repo-states
```

**Response:**

```ts
Array<{
  id: string
  execution_process_id: string
  repo_id: string
  before_head_commit: string | null
  after_head_commit: string | null
  merge_commit: string | null
  created_at: string
  updated_at: string
}>
```

### Stop execution process

```
POST /api/execution-processes/{id}/stop
```

**Response:** `void`

---

## Repositories

### List all repos

```
GET /api/repos
```

**Response:** `Repo[]` (host-aware — may route through relay)

### List recent repos

```
GET /api/repos/recent
```

**Response:** `Repo[]`

### Get repo by ID

```
GET /api/repos/{id}
```

**Response:** `Repo`

### Register repo

```
POST /api/repos
```

**Request body:**

```ts
{
  path: string
  display_name?: string
}
```

**Response:** `Repo`

### Initialize new repo

```
POST /api/repos/init
```

**Request body:**

```ts
{
  parent_path: string
  folder_name: string
}
```

**Response:** `Repo`

### Update repo

```
PUT /api/repos/{id}
```

**Request body:**

```ts
{
  display_name?: string | null
  setup_script?: string | null
  cleanup_script?: string | null
  archive_script?: string | null
  copy_files?: string | null
  parallel_setup_script?: boolean | null
  dev_server_script?: string | null
  default_target_branch?: string | null
  default_working_dir?: string | null
}
```

**Response:** `Repo`

### Delete repo

```
DELETE /api/repos/{id}
```

**Response:** `void`

### Get batch repos

```
POST /api/repos/batch
```

**Request body:**

```ts
{ ids: string[] }
```

**Response:** `Repo[]`

### List branches

```
GET /api/repos/{id}/branches
```

**Response:**

```ts
Array<{
  name: string
  is_current: boolean
  is_remote: boolean
  last_commit_date: string
}>
```

### List remotes

```
GET /api/repos/{id}/remotes
```

**Response:**

```ts
Array<{
  name: string
  url: string
}>
```

### Search files in repo

```
GET /api/repos/{id}/search?q={query}&mode={mode}
```

`mode`: `"taskform"` | `"settings"`

**Response:**

```ts
Array<{
  path: string
  is_file: boolean
  match_type: "FileName" | "DirectoryName" | "FullPath"
  score: number
}>
```

### Open repo in editor

```
POST /api/repos/{id}/open-editor
```

**Request body:**

```ts
{
  editor_type: string | null
  file_path: string | null
}
```

**Response:**

```ts
{ url: string | null }
```

---

## Filesystem

### List directory

```
GET /api/filesystem/directory?path={path}
```

**Response:**

```ts
{
  entries: Array<DirectoryEntry>
  current_path: string
}
```

### List git repos in path

```
GET /api/filesystem/git-repos?path={path}
```

**Response:** `DirectoryEntry[]`

---

## Search (Multi-repo)

```
GET /api/search?q={query}&repo_ids={csv}&mode={mode}
```

**Response:** `SearchResult[]`

---

## Tags

### List tags

```
GET /api/tags?search={query}
```

**Response:**

```ts
Array<{
  id: string
  tag_name: string
  content: string
  created_at: string
  updated_at: string
}>
```

### Create tag

```
POST /api/tags
```

**Request body:**

```ts
{
  tag_name: string
  content: string
}
```

**Response:** `Tag`

### Update tag

```
PUT /api/tags/{id}
```

**Request body:**

```ts
{
  tag_name: string | null
  content: string | null
}
```

**Response:** `Tag`

### Delete tag

```
DELETE /api/tags/{id}
```

**Response:** `void`

---

## Config & System

### Get system info

```
GET /api/info
```

**Response:**

```ts
{
  version: string
  config: Config
  machine_id: string
  login_status: LoginStatus
  remote_auth_degraded: string | null
  environment: Environment
  capabilities: Record<string, Array<BaseAgentCapability>>
  shared_api_base: string | null
  preview_proxy_port: number | null
  executors: Record<BaseCodingAgent, ExecutorProfile>
}
```

### Save config

```
PUT /api/config
```

**Request body:**

```ts
{
  config_version: string
  theme: "LIGHT" | "DARK" | "SYSTEM"
  executor_profile: string
  disclaimer_acknowledged: boolean
  onboarding_acknowledged: boolean
  remote_onboarding_acknowledged: boolean
  notifications: NotificationConfig
  editor: EditorConfig
  github: GitHubConfig
  analytics_enabled: boolean
  workspace_dir: string | null
  last_app_version: string | null
  show_release_notes: boolean
  language: UiLanguage
  git_branch_prefix: string
  showcases: ShowcaseState
  pr_auto_description_enabled: boolean
  pr_auto_description_prompt: string | null
  commit_reminder_enabled: boolean
  commit_reminder_prompt: string | null
  send_message_shortcut: SendMessageShortcut
  relay_enabled: boolean
  host_nickname: string | null
}
```

**Response:** `Config`

### Check editor availability

```
GET /api/editors/check-availability?editor_type={type}
```

`editor_type`: `"VS_CODE"` | `"VS_CODE_INSIDERS"` | `"CURSOR"` | `"WINDSURF"` | `"INTELLI_J"` | `"ZED"` | `"XCODE"` | `"GOOGLE_ANTIGRAVITY"` | `"CUSTOM"`

**Response:**

```ts
{ available: boolean }
```

### Check agent availability

```
GET /api/agents/check-availability?executor={agent}
```

`agent`: `"CLAUDE_CODE"` | `"AMP"` | `"GEMINI"` | `"CODEX"` | `"OPENCODE"` | `"CURSOR_AGENT"` | `"QWEN_CODE"` | `"COPILOT"` | `"DROID"`

**Response:**

```ts
{ type: "LOGIN_DETECTED", last_auth_timestamp: number }
| { type: "INSTALLATION_FOUND" }
| { type: "NOT_FOUND" }
```

---

## Agents & Model Discovery

### Get preset options

```
GET /api/agents/preset-options?executor={agent}&variant={variant}
```

**Response:** `ExecutorConfig`

### Discover model options (WebSocket)

```
WS /api/agents/discovered-options/ws?executor={agent}&workspace_id={id}&session_id={id}&repo_id={id}
```

Streams discovered model options dynamically as JSON messages.

---

## MCP Server Config

### Load MCP config

```
GET /api/mcp-config?executor={BaseCodingAgent}
```

**Response:**

```ts
{
  mcp_config: McpConfig
  config_path: string
}
```

### Save MCP config

```
POST /api/mcp-config?executor={BaseCodingAgent}
```

**Request body:**

```ts
{
  servers: Record<string, JsonValue>
}
```

**Response:** `void`

---

## Profiles (Executor Presets)

### Load profiles

```
GET /api/profiles
```

**Response:**

```ts
{
  content: string   // raw JSON string of profile config
  path: string      // filesystem path to profiles file
}
```

### Save profiles

```
PUT /api/profiles
```

**Request body:** raw JSON string

**Response:** `string`

---

## Attachments (Local)

### Upload attachment

```
POST /api/attachments/upload
Content-Type: multipart/form-data
```

**Form field:** `image` (File)

**Response:**

```ts
{
  id: string
  file_path: string
  original_name: string
  mime_type: string | null
  size_bytes: number
  hash: string
  created_at: string
  updated_at: string
}
```

### Upload attachment for task

```
POST /api/attachments/task/{taskId}/upload
Content-Type: multipart/form-data
```

**Form field:** `image` (File)

**Response:** `AttachmentResponse` (same shape as above)

### Upload attachment for session

```
POST /api/workspaces/{id}/attachments/upload?session_id={sessionId}
Content-Type: multipart/form-data
```

**Form field:** `image` (File)

**Response:** `AttachmentResponse`

### Delete attachment

```
DELETE /api/attachments/{id}
```

**Response:** `void`

### Get task attachments

```
GET /api/attachments/task/{taskId}
```

**Response:** `AttachmentResponse[]`

### Serve attachment file

```
GET /api/attachments/{id}/file
```

**Response:** binary file

---

## Approvals

### Respond to approval

```
POST /api/approvals/{id}/respond
```

**Request body:**

```ts
{
  execution_process_id: string
  status: ApprovalOutcome
}
```

**Response:**

```ts
{ status: "pending" }
| { status: "approved" }
| { status: "denied", reason?: string }
| { status: "timed_out" }
```

---

## Authentication

### Get auth methods

```
GET /api/auth/methods
```

**Response:**

```ts
{
  local_auth_enabled: boolean
  oauth_providers: string[]
}
```

### Start OAuth handoff

```
POST /api/auth/handoff/init
```

**Request body:**

```ts
{
  provider: string
  return_to: string
}
```

**Response:**

```ts
{
  handoff_id: string
  authorize_url: string
}
```

### Get auth status

```
GET /api/auth/status
```

**Response:**

```ts
{
  logged_in: boolean
  profile: {
    user_id: string
    username: string | null
    email: string
    providers: Array<ProviderProfile>
  } | null
  degraded: boolean | null
}
```

### Local login

```
POST /api/auth/local/login
```

**Request body:**

```ts
{
  email: string
  password: string
}
```

**Response:**

```ts
{
  user_id: string
  username: string | null
  email: string
  providers: Array<ProviderProfile>
}
```

### Logout

```
POST /api/auth/logout
```

**Response:** `void`

### Get access token

```
GET /api/auth/token
```

**Response:**

```ts
{
  access_token: string
  expires_at: string | null
}
```

### Get current user

```
GET /api/auth/user
```

**Response:**

```ts
{ user_id: string }
```

---

## Session Queue

### Queue follow-up message

```
POST /api/sessions/{id}/queue
```

Queues a message to execute when the current agent finishes.

**Request body:**

```ts
{
  message: string
  executor_config: ExecutorConfig
}
```

**Response:** `QueueStatus`

### Cancel queued message

```
DELETE /api/sessions/{id}/queue
```

**Response:** `QueueStatus`

### Get queue status

```
GET /api/sessions/{id}/queue
```

**Response:**

```ts
{ status: "empty" }
| { status: "queued", message: QueuedMessage }
```

---

## Scratch Pads

Scratch types: `"DRAFT_TASK"` | `"DRAFT_FOLLOW_UP"` | `"DRAFT_WORKSPACE"` | `"DRAFT_ISSUE"` | `"PREVIEW_SETTINGS"` | `"WORKSPACE_NOTES"` | `"UI_PREFERENCES"` | `"PROJECT_REPO_DEFAULTS"`

### Create scratch

```
POST /api/scratch/{type}/{id}
```

**Request body:**

```ts
{ payload: ScratchPayload }
```

**Response:**

```ts
{
  id: string
  payload: ScratchPayload
  created_at: string
  updated_at: string
}
```

### Get scratch

```
GET /api/scratch/{type}/{id}
```

**Response:** `Scratch`

### Update scratch

```
PUT /api/scratch/{type}/{id}
```

**Request body:**

```ts
{ payload: ScratchPayload }
```

**Response:** `void`

### Delete scratch

```
DELETE /api/scratch/{type}/{id}
```

**Response:** `void`

### Stream scratch updates (WebSocket)

```
WS /api/scratch/{type}/{id}/stream/ws
```

---

## Migration

### List projects for migration

```
GET /api/migration/projects
```

**Response:**

```ts
Array<{
  id: string
  name: string
  default_agent_working_dir: string | null
  remote_project_id: string | null
  created_at: string
  updated_at: string
}>
```

### Start migration

```
POST /api/migration/start
```

**Request body:**

```ts
{
  organization_id: string
  project_ids: Array<string>
}
```

**Response:**

```ts
{ report: MigrationReport }
```

---

## Releases

```
GET /api/releases
```

**Response:**

```ts
{
  releases: Array<{
    name: string
    tag_name: string
    published_at: string
    body: string
  }>
}
```

---

## Relay (Remote Pairing)

### Get enrollment code

```
POST /api/relay-auth/server/enrollment-code
```

**Response:**

```ts
{ enrollment_code: string }
```

### List paired clients

```
GET /api/relay-auth/server/clients
```

**Response:**

```ts
Array<{
  client_id: string
  client_name: string
  client_browser: string
  client_os: string
  client_device: string
}>
```

### Remove paired client

```
DELETE /api/relay-auth/server/clients/{clientId}
```

**Response:**

```ts
{ removed: boolean }
```

### Pair with relay host

```
POST /api/relay-auth/client/pair
```

**Request body:**

```ts
{
  host_id: string
  host_name: string
  enrollment_code: string
}
```

**Response:**

```ts
{ paired: boolean }
```

### List paired relay hosts

```
GET /api/relay-auth/client/hosts
```

**Response:**

```ts
Array<{
  host_id: string
  host_name: string | null
  paired_at: string | null
}>
```

### Remove paired relay host

```
DELETE /api/relay-auth/client/hosts/{hostId}
```

**Response:**

```ts
{ removed: boolean }
```

### Open remote workspace in editor

```
POST /api/open-remote-editor/workspace
```

**Request body:**

```ts
{
  host_id: string
  workspace_id: string
  editor_type: string | null
  file_path: string | null
}
```

**Response:**

```ts
{
  url: string
  local_port: number
  ssh_alias: string
}
```

---

## Remote API — Organizations & Billing

All calls go to the remote cloud server via authenticated `{REMOTE_API_BASE}/v1/...` requests.

### List user organizations

```
GET /v1/organizations
```

**Response:**

```ts
{
  organizations: Array<OrganizationWithRole>
}
```

### Create organization

```
POST /v1/organizations
```

**Request body:**

```ts
{
  name: string
  slug: string
}
```

**Response:**

```ts
{ organization: OrganizationWithRole }
```

### Delete organization

```
DELETE /v1/organizations/{id}
```

**Response:** `void`

### List organization members

```
GET /v1/organizations/{id}/members
```

**Response:**

```ts
{
  members: Array<{
    user_id: string
    role: "ADMIN" | "MEMBER"
    joined_at: string
    first_name: string | null
    last_name: string | null
    username: string | null
    email: string | null
    avatar_url: string | null
  }>
}
```

### Remove member

```
DELETE /v1/organizations/{id}/members/{userId}
```

**Response:** `void`

### Update member role

```
PATCH /v1/organizations/{id}/members/{userId}/role
```

**Request body:**

```ts
{ role: "ADMIN" | "MEMBER" }
```

**Response:**

```ts
{
  user_id: string
  role: "ADMIN" | "MEMBER"
}
```

### List invitations

```
GET /v1/organizations/{id}/invitations
```

**Response:**

```ts
{
  invitations: Array<{
    id: string
    organization_id: string
    invited_by_user_id: string | null
    email: string
    role: "ADMIN" | "MEMBER"
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED"
    token: string
    created_at: string
    expires_at: string
  }>
}
```

### Create invitation

```
POST /v1/organizations/{id}/invitations
```

**Request body:**

```ts
{
  email: string
  role: "ADMIN" | "MEMBER"
}
```

**Response:**

```ts
{ invitation: Invitation }
```

### Revoke invitation

```
POST /v1/organizations/{id}/invitations/revoke
```

**Request body:**

```ts
{ invitation_id: string }
```

**Response:** `void`

### Get billing status

```
GET /v1/organizations/{id}/billing
```

**Response:**

```ts
{
  status: "free" | "active" | "past_due" | "cancelled" | "requires_subscription"
  billing_enabled: boolean
  seat_info: {
    current_members: number
    free_seats: number
    requires_subscription: boolean
    subscription: {
      status: string
      current_period_end: string
      cancel_at_period_end: boolean
      quantity: number
      unit_amount: number
    } | null
  } | null
}
```

### Create Stripe checkout session

```
POST /v1/organizations/{id}/billing/checkout
```

**Request body:**

```ts
{
  success_url: string
  cancel_url: string
}
```

**Response:**

```ts
{ url: string }
```

### Create Stripe portal session

```
POST /v1/organizations/{id}/billing/portal
```

**Request body:**

```ts
{ return_url: string }
```

**Response:**

```ts
{ url: string }
```

---

## Remote API — Projects

### List projects by organization

```
GET /api/remote/projects?organization_id={id}
```

**Response:**

```ts
{
  projects: Array<{
    id: string
    organization_id: string
    name: string
    color: string
    sort_order: number
    created_at: string
    updated_at: string
  }>
}
```

---

## Remote API — Bulk Operations

### Bulk update projects

```
POST /v1/projects/bulk
```

**Request body:**

```ts
{
  updates: Array<{
    id: string
    name?: string | null
    color?: string | null
    sort_order?: number | null
  }>
}
```

### Bulk update issues

```
POST /v1/issues/bulk
```

**Request body:**

```ts
{
  updates: Array<{
    id: string
    // partial UpdateIssueRequest fields
  }>
}
```

### Bulk update project statuses

```
POST /v1/project_statuses/bulk
```

**Request body:**

```ts
{
  updates: Array<{
    id: string
    name?: string | null
    color?: string | null
    sort_order?: number | null
    hidden?: boolean | null
  }>
}
```

---

## Remote API — Relay Hosts

```
GET /v1/hosts
```

**Response:**

```ts
{
  hosts: Array<{
    id: string
    owner_user_id: string
    machine_id: string
    name: string
    status: string
    last_seen_at: string | null
    agent_version: string | null
    created_at: string
    updated_at: string
    access_role: string
  }>
}
```

---

## Remote API — Attachments (Azure Blob Storage)

Upload flow: `init` -> upload to Azure SAS URL -> `confirm` -> `commit`

### Initialize upload

```
POST /v1/attachments/init
```

**Request body:**

```ts
{
  project_id: string
  filename: string
  size_bytes: number
  hash: string           // SHA-256 hex
}
```

**Response:**

```ts
{
  upload_url: string         // Azure SAS URL
  upload_id: string
  expires_at: string
  skip_upload: boolean       // true if blob already exists (dedup)
  existing_blob_id: string | null
}
```

### Upload to Azure (direct)

```
PUT {upload_url}
x-ms-blob-type: BlockBlob
Content-Type: {mime_type}
```

**Body:** raw file bytes (supports XHR progress events)

### Confirm upload

```
POST /v1/attachments/confirm
```

**Request body:**

```ts
{
  project_id: string
  upload_id: string
  filename: string
  content_type?: string
  size_bytes: number
  hash: string
  issue_id?: string
  comment_id?: string
}
```

**Response:**

```ts
{
  id: string
  blob_id: string
  issue_id: string | null
  comment_id: string | null
  created_at: string
  expires_at: string | null
  blob_path: string
  thumbnail_blob_path: string | null
  original_name: string
  mime_type: string | null
  size_bytes: number
  hash: string
  width: number | null
  height: number | null
}
```

### Commit issue attachments

```
POST /v1/issues/{issueId}/attachments/commit
```

**Request body:**

```ts
{ attachment_ids: Array<string> }
```

**Response:**

```ts
{ attachments: Array<AttachmentWithBlob> }
```

### Commit comment attachments

```
POST /v1/comments/{commentId}/attachments/commit
```

**Request body:**

```ts
{ attachment_ids: Array<string> }
```

**Response:**

```ts
{ attachments: Array<AttachmentWithBlob> }
```

### Delete remote attachment

```
DELETE /v1/attachments/{id}
```

**Response:** `void`

### Get attachment SAS URL

```
GET /v1/attachments/{id}/{file|thumbnail}
```

**Response:**

```ts
{ url: string }    // time-limited SAS URL, cached client-side for 4 minutes
```

---

## WebSocket Streams

All opened via the local API WebSocket transport.

### Workspace list updates

```
WS /api/workspaces/streams/ws?archived={bool}
```

Streams JSON patch operations for real-time workspace list sync.

### Raw agent logs

```
WS /api/execution-processes/{id}/raw-logs/ws
```

Streams raw agent output as it runs.

### Normalized agent logs

```
WS /api/execution-processes/{id}/normalized-logs/ws
```

Streams parsed/normalized agent output.

### Approval requests

```
WS /api/approvals/stream/ws
```

Streams tool approval requests that need user response.

### Terminal

```
WS /api/terminal/ws?workspace_id={id}&cols={n}&rows={n}
```

Full terminal session (xterm-compatible).

### Scratch pad updates

```
WS /api/scratch/{type}/{id}/stream/ws
```

### Agent model discovery

```
WS /api/agents/discovered-options/ws?executor={agent}&workspace_id={id}&session_id={id}&repo_id={id}
```

Dynamically streams discovered model options for the selected agent type.

### Git diff stream

```
WS /api/workspaces/{id}/git/diff/ws
```

Streams git diff data for the workspace.

---

## External API Calls (Direct from Browser)

These bypass the local backend entirely — called from the browser with no auth.

### GitHub star count

```
GET https://api.github.com/repos/BloopAI/vibe-kanban
```

### Discord online count

```
GET https://discord.com/api/guilds/1423630976524877857/widget.json
```

---

## MCP Server Tools

The MCP server exposes tools to AI agents. These tools call the local backend API internally.
Two modes with different tool availability:

### Global Mode (32 tools)

#### get_context

Returns project, issue, workspace, and orchestrator-session metadata for the current context.

**Parameters:** none

#### list_organizations

**Parameters:** none

**Returns:** Array of `{ id, name, slug }`

#### list_org_members

**Parameters:**

- `organization_id` (optional) — defaults to current org

**Returns:** Array of `{ user_id, role, profile }`

#### list_projects

**Parameters:**

- `organization_id` (required)

**Returns:** Array of `{ id, name }`

#### create_issue

**Parameters:**

- `project_id` (optional — inferred if workspace is linked)
- `title` (required)
- `description` (optional)
- `priority` (optional) — `"urgent"` | `"high"` | `"medium"` | `"low"`
- `parent_issue_id` (optional)

**Returns:** Created issue

#### list_issues

**Parameters:**

- `project_id` (optional)
- `status` (optional)
- `priority` (optional)
- `search` (optional)
- `simple_id` (optional)
- `assignee_user_id` (optional)
- `tag_id` (optional)
- `tag_name` (optional)
- `parent_issue_id` (optional)
- `sort_by` (optional)
- `sort_direction` (optional)
- `page` (optional)
- `per_page` (optional)

**Returns:** Paginated issue list

#### get_issue

**Parameters:**

- `issue_id` (required)

**Returns:** Full issue details including tags, relationships, sub-issues, PRs

#### update_issue

**Parameters:**

- `issue_id` (required)
- `title` (optional)
- `description` (optional)
- `status` (optional)
- `priority` (optional)
- `parent_issue_id` (optional)

#### delete_issue

**Parameters:**

- `issue_id` (required)

#### list_issue_priorities

**Returns:** `["urgent", "high", "medium", "low"]`

#### list_issue_assignees

**Parameters:**

- `issue_id` (required)

#### assign_issue

**Parameters:**

- `issue_id` (required)
- `user_id` (required)

#### unassign_issue

**Parameters:**

- `issue_assignee_id` (required)

#### list_tags

**Parameters:**

- `project_id` (optional)

**Returns:** Array of `{ id, name, color }`

#### list_issue_tags

**Parameters:**

- `issue_id` (required)

#### add_issue_tag

**Parameters:**

- `issue_id` (required)
- `tag_id` (required)

#### remove_issue_tag

**Parameters:**

- `issue_tag_id` (required)

#### create_issue_relationship

**Parameters:**

- `issue_id` (required)
- `related_issue_id` (required)
- `relationship_type` (required) — `"blocking"` | `"related"` | `"has_duplicate"`

#### delete_issue_relationship

**Parameters:**

- `relationship_id` (required)

#### list_repos

**Returns:** Array of `{ id, name }`

#### get_repo

**Parameters:**

- `repo_id` (required)

**Returns:** `{ id, name, display_name, setup_script, cleanup_script, dev_server_script }`

#### update_setup_script

**Parameters:**

- `repo_id` (required)
- `script` (required)

#### update_cleanup_script

**Parameters:**

- `repo_id` (required)
- `script` (required)

#### update_dev_server_script

**Parameters:**

- `repo_id` (required)
- `script` (required)

#### list_workspaces

**Parameters:**

- `archived` (optional)
- `pinned` (optional)
- `branch` (optional)
- `search` (optional)

#### update_workspace

**Parameters:**

- `workspace_id` (required)
- `archived` (optional)
- `pinned` (optional)
- `name` (optional)

#### delete_workspace

**Parameters:**

- `workspace_id` (required)
- `delete_remote` (optional)
- `delete_branches` (optional)

#### start_workspace

Creates a workspace and starts its first coding-agent session.

**Parameters:**

- `name` (required)
- `executor` (required) — agent type + config
- `repositories` (required) — array of repo refs
- `issue_id` (optional) — links workspace to issue

**Returns:** `{ workspace, execution_process }`

#### link_workspace_issue

**Parameters:**

- `workspace_id` (required)
- `issue_id` (required)

#### create_session

**Parameters:**

- `workspace_id` (required)
- `executor` (optional)
- `name` (optional)

#### list_sessions

**Parameters:**

- `workspace_id` (optional)

#### update_session

**Parameters:**

- `session_id` (required)
- `name` (optional)

#### run_session_prompt

**Parameters:**

- `session_id` (required)
- `prompt` (required)

**Returns:** `{ execution_id }` — use `get_execution` to poll status

#### get_execution

**Parameters:**

- `execution_id` (required)

**Returns:** Execution status and final message

### Orchestrator Mode (7 tools)

Limited subset for orchestrator sessions:

`get_context`, `create_session`, `list_sessions`, `update_session`, `run_session_prompt`, `get_execution`, `update_workspace`

(`list_workspaces` and `delete_workspace` are removed in orchestrator mode)

---

## Shared Enums & Types Reference

### ExecutorConfig

```ts
{
  executor: BaseCodingAgent
  variant?: string | null
  model_override?: string | null
  agent_id?: string | null
  reasoning_id?: string | null
  permission_policy?: PermissionPolicy | null
}
```

### BaseCodingAgent

```ts
"CLAUDE_CODE" | "AMP" | "GEMINI" | "CODEX" | "OPENCODE" | "CURSOR_AGENT" | "QWEN_CODE" | "COPILOT" | "DROID"
```

### Session

```ts
{
  id: string
  workspace_id: string
  name: string | null
  executor: string | null
  agent_working_dir: string | null
  created_at: string
  updated_at: string
}
```

### Workspace

```ts
{
  id: string
  task_id: string | null
  container_ref: string | null
  branch: string
  setup_completed_at: string | null
  created_at: string
  updated_at: string
  archived: boolean
  pinned: boolean
  name: string | null
  worktree_deleted: boolean
}
```

### ExecutionProcess

```ts
{
  id: string
  session_id: string
  run_reason: "setupscript" | "cleanupscript" | "archivescscript" | "codingagent" | "devserver"
  executor_action: ExecutorAction
  status: "running" | "completed" | "failed" | "killed"
  exit_code: number | null
  dropped: boolean
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}
```

### Repo

```ts
{
  id: string
  path: string
  name: string
  display_name: string
  setup_script: string | null
  cleanup_script: string | null
  archive_script: string | null
  copy_files: string | null
  parallel_setup_script: boolean
  dev_server_script: string | null
  default_target_branch: string | null
  default_working_dir: string | null
  created_at: string
  updated_at: string
}
```

### RepoWithTargetBranch

Extends `Repo` with:

```ts
{
  target_branch: string
  // ...all Repo fields
}
```

### MergeStatus

```ts
"open" | "merged" | "closed"
```

### ProviderKind

```ts
"github" | "gitlab" | "bitbucket"
```

### MemberRole

```ts
"ADMIN" | "MEMBER"
```

### EditorType

```ts
"VS_CODE" | "VS_CODE_INSIDERS" | "CURSOR" | "WINDSURF" | "INTELLI_J" | "ZED" | "XCODE" | "GOOGLE_ANTIGRAVITY" | "CUSTOM"
```
