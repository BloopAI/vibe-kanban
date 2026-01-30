# JIRA Integration - Feature Specification

## Executive Summary

This document outlines the design and implementation strategy for integrating Atlassian JIRA with Vibe Kanban. The integration would enable users to synchronize tasks, issues, and work status between JIRA and Vibe Kanban, allowing development teams to leverage AI coding agents while maintaining their existing JIRA-based project management workflows.

---

## Motivation

### Problem Statement

Many engineering teams use JIRA as their primary project management and issue tracking system. These organizations face challenges when adopting AI coding agents through Vibe Kanban because:

1. **Workflow Fragmentation**: Teams must manually duplicate work items between JIRA and Vibe Kanban
2. **Status Tracking Overhead**: Task status, progress, and completion must be updated in two separate systems
3. **Loss of Context**: Rich issue metadata (labels, components, epics, sprints) doesn't transfer to local development workflows
4. **Reporting Gaps**: Management and stakeholders lose visibility when work moves to Vibe Kanban
5. **Integration Lock-in**: Teams are reluctant to adopt new tools that don't integrate with their existing workflows

### Business Value

A JIRA integration would:

- **Reduce friction** for enterprise teams adopting AI coding agents
- **Maintain compliance** with existing project management processes
- **Enable visibility** for non-technical stakeholders into AI-assisted development work
- **Preserve institutional knowledge** by keeping all work documented in the system of record
- **Accelerate adoption** by reducing the learning curve and workflow changes

---

## Key Use Cases

### 1. Bi-Directional Task Synchronization

**User Story**: As a developer, I want to import JIRA issues into Vibe Kanban so that I can work on them using AI coding agents without manually recreating task details.

**Flow**:
1. Developer authenticates with JIRA (OAuth 2.0 or API token)
2. Developer browses/searches JIRA issues within Vibe Kanban
3. Developer selects one or more issues to sync
4. Vibe Kanban creates local tasks with:
   - Title from JIRA summary
   - Description from JIRA description field
   - Metadata: JIRA issue key, status, priority, labels, assignee
5. Developer works on task using coding agents
6. Status updates in Vibe Kanban optionally sync back to JIRA

**Acceptance Criteria**:
- Issues sync within 5 seconds
- All standard JIRA field types are supported (text, dropdowns, custom fields)
- Markdown formatting is preserved in descriptions
- Attachments/images are accessible (read-only or synced)

### 2. Automatic Status Synchronization

**User Story**: As a project manager, I want JIRA issue statuses to update when work starts and completes in Vibe Kanban so that I have visibility into development progress without manual updates.

**Flow**:
1. Developer starts a workspace for a JIRA-linked task
2. Vibe Kanban transitions JIRA issue to "In Progress" (one-time on first workspace start)
3. Developer completes work and marks task as Done in Vibe Kanban
4. Vibe Kanban transitions JIRA issue to "Done"

**Important Notes**:
- Status transitions happen only at **significant milestones**, not for ephemeral AI agent interactions
- "In Progress" is set once when work begins, not on every AI query
- Intermediate statuses (like "In Review") are **not automatically synced** to avoid noise
- Users can manually trigger status sync from the task detail view if needed

**Mapping Strategy**:
```
Vibe Kanban Action       →  JIRA Status Transition
───────────────────────────────────────────────────────
Start first workspace    →  In Progress / In Development
(one-time transition)    →  (if currently in Backlog/Todo)

Mark task as Done        →  Done / Resolved / Closed
(user explicit action)   →  (automatic transition)

Mark as Cancelled        →  Cancelled / Won't Do
(user explicit action)   →  (automatic transition)
```

**Configuration**:
- Per-project mapping of Vibe Kanban statuses to JIRA workflow transitions
- Option to disable automatic updates (manual sync only)
- Manual "Sync to JIRA" button in task detail view for on-demand updates
- Conflict resolution when statuses diverge

### 3. Work Logging and Time Tracking (Optional)

**User Story**: As a developer subject to time tracking requirements, I want to optionally log work time to JIRA from Vibe Kanban so I can meet organizational reporting requirements.

**Flow**:
1. Developer works on a JIRA-linked task (Vibe Kanban tracks session duration)
2. When completing work, developer can optionally:
   - Click "Log Time to JIRA" button
   - Review/edit the time amount and description
   - Submit worklog entry to JIRA
3. Alternatively, enable "Auto-log time on task completion" in settings (opt-in)

**Important Notes**:
- **User control**: Time logging is opt-in, not automatic by default
- **Review before submit**: User can see and edit time/description before posting
- **Configurable**: Can be enabled per-project or globally in settings
- **Accurate tracking**: Vibe Kanban tracks actual active work time, excluding idle periods

**Worklog Format**:
```
Time logged: 2h 15m
Description: Implemented authentication feature using Claude Code
- Created 5 files, modified 12 files
- 247 lines added, 83 removed
- PR: https://github.com/org/repo/pull/123
```

**Configuration Options**:
- "Enable automatic time logging on task completion" (default: off)
- "Prompt to log time when marking task as Done" (default: on)
- "Include detailed work summary in worklog" (default: on)

### 4. Pull Request Linking

**User Story**: As a code reviewer, I want to see PRs created in Vibe Kanban linked to JIRA issues so I can access the full context from JIRA.

**Flow**:
1. Developer creates PR from Vibe Kanban workspace
2. Vibe Kanban adds JIRA issue key to PR title or body
3. Vibe Kanban uses JIRA API to link PR to issue (Development panel)
4. JIRA shows PR status, commits, and branches in issue view
5. PR status updates (merged, closed) sync back to JIRA

**GitHub/JIRA Integration Points**:
- Uses JIRA's existing GitHub integration for smart commits
- Falls back to manual PR linking via REST API
- Supports Bitbucket and other JIRA-integrated source control

### 5. Comment Synchronization (User-Initiated)

**User Story**: As a team member, I want to share progress updates from Vibe Kanban to JIRA when appropriate, so stakeholders can follow along without being overwhelmed by automated noise.

**Flow**:
1. Developer works on a JIRA-linked task using AI agents
2. When ready to share progress, developer explicitly chooses one of:
   - "Update JIRA Status" button → Syncs status only
   - "Post Summary to JIRA" button → Creates a comment summarizing work done
3. Vibe Kanban generates a summary comment and posts to JIRA issue:
   - High-level summary of changes made
   - Link to workspace (if using remote/cloud Vibe Kanban)
   - Key files modified
   - PR link (if created)

**Important Design Principles**:
- **User-initiated only**: No automatic comment posting to avoid spamming JIRA
- **Summaries, not logs**: Comments are high-level summaries, not detailed AI conversation logs
- **Explicit actions**: Clear UI buttons for "Share to JIRA" or "Post Update"
- **One-way for comments**: Vibe Kanban can read JIRA comments, but only posts when user requests

**Comment Examples**:
```
[Posted by John Doe via Vibe Kanban]

Completed user authentication implementation:
✓ Implemented JWT-based auth flow
✓ Added unit tests (15 passing)
✓ Updated API documentation

Files changed: 8 files, +247 lines, -83 lines
PR: https://github.com/org/repo/pull/123
```

**Configuration Options**:
- "Prompt to post summary when marking task as Done" (optional reminder)
- "Include file change statistics in summaries" (on/off)
- "Include PR links in summaries" (on/off)

### 6. Epic and Sprint Integration

**User Story**: As a product owner, I want to organize Vibe Kanban projects by JIRA epics and sprints so AI agent work aligns with our agile planning.

**Flow**:
1. Developer views JIRA epics and sprints in Vibe Kanban
2. Developer filters/groups tasks by epic or active sprint
3. Bulk operations on sprint issues (import all sprint issues)
4. Sprint burndown/velocity data reflects AI agent work

---

## Technical Architecture

### Integration Patterns

#### Option A: REST API Integration (Recommended for Production)
- Uses JIRA Cloud REST API v3 or JIRA Server REST API v2
- Polling-based sync (configurable interval: 30s - 5m)
- Webhook support for real-time updates (JIRA → Vibe Kanban)
- Local cache to reduce API calls

**Pros**:
- Works with both JIRA Cloud and Server/Data Center
- No third-party dependencies
- Full control over sync logic and scheduling
- Can support custom fields and workflows
- Deterministic, testable, reliable
- No AI token costs for sync operations
- Efficient: direct database updates without LLM overhead

**Cons**:
- API rate limits (Cloud: 10 req/sec, Server: varies)
- Latency for status updates (polling delay)
- Complex OAuth setup for Cloud
- Need to implement retry logic, error handling

**Best For**: Core sync functionality (status updates, issue import, worklog posting)

#### Option B: JIRA MCP (Model Context Protocol)
- AI agent uses MCP server to interact with JIRA
- Tools available to LLM for reading/writing JIRA data
- Agent decides when and how to use JIRA tools

**Pros**:
- Flexible: AI can decide when JIRA operations are needed
- Natural language interface to JIRA
- Can handle complex, multi-step workflows
- Useful for ad-hoc queries ("what JIRA issues are assigned to me?")

**Cons**:
- **Unpredictable**: AI might sync when not intended, or miss syncs
- **Expensive**: Every JIRA operation costs AI tokens
- **Unreliable for automation**: Can't guarantee status syncs happen
- **Context window overhead**: JIRA tool descriptions consume tokens
- **Latency**: Each operation requires LLM call + JIRA API call
- **Poor fit for background sync**: Can't run scheduled jobs
- **User confusion**: When did AI sync? Did it work? No transparency

**Best For**: Ad-hoc user queries within AI conversations ("show me high priority JIRA issues")

#### Option C: Jira CLI Integration
- Similar to GitHub CLI pattern (`gh`)
- Uses Jira CLI tool for authentication
- Command-line operations for sync

**Pros**:
- Simpler authentication (leverages CLI auth)
- Consistent with existing GitHub integration pattern
- Easier for users already using Jira CLI

**Cons**:
- Limited Jira CLI adoption
- Less functionality than REST API
- Additional dependency to install

**Best For**: Optional fallback authentication method

#### Recommendation: REST API + Optional MCP for AI Features

**Primary Integration (REST API)**:
- All automatic sync operations (status updates, issue import)
- Scheduled background tasks (polling for updates)
- Webhook handling (real-time JIRA → Vibe Kanban)
- User-initiated actions (post summary, log time)
- Reliable, deterministic operations

**Supplementary MCP (Optional)**:
- AI agent can answer JIRA queries during conversation
- "Show me JIRA issues related to this error"
- "What's the status of JIRA-123?"
- "Find JIRA issues with label 'auth'"
- User explicitly asks AI to interact with JIRA

**Why This Split?**
1. **Reliability**: Critical sync operations shouldn't depend on AI decision-making
2. **Performance**: Background sync can't wait for LLM inference
3. **Cost**: Syncing hundreds of issues via MCP would be prohibitively expensive
4. **Transparency**: Users know when REST API syncs happen (on workspace start, on mark done)
5. **Best of both worlds**: Structured sync + flexible AI queries when needed

**Implementation Strategy**:
```rust
// Core sync engine (REST API)
struct JiraSyncEngine {
    client: JiraRestClient,
    scheduler: SyncScheduler,
    webhook_handler: WebhookHandler,
}

impl JiraSyncEngine {
    // Automatic, scheduled operations
    async fn sync_issue_status(&self, task_id: Uuid) -> Result<()>
    async fn import_issues(&self, jql: String) -> Result<Vec<Issue>>
    async fn post_comment(&self, issue_key: &str, comment: &str) -> Result<()>
}

// Optional MCP for AI queries (if user has MCP configured)
struct JiraMcpTools {
    // Available to AI agent during conversations
    // Used only when user asks AI to query JIRA
    async fn search_issues(&self, natural_language_query: &str) -> Result<Vec<Issue>>
    async fn get_issue_details(&self, issue_key: &str) -> Result<Issue>
}
```

### REST API vs MCP: Practical Decision Guide

This table shows which approach to use for common JIRA integration scenarios:

| Scenario | Use REST API | Use MCP | Rationale |
|----------|--------------|---------|-----------|
| **Import JIRA issue when user clicks "Import"** | ✅ Yes | ❌ No | User action triggers deterministic sync |
| **Sync status to "In Progress" when workspace starts** | ✅ Yes | ❌ No | Must happen reliably, no AI decision needed |
| **Sync status to "Done" when user marks task complete** | ✅ Yes | ❌ No | Critical state change, can't be missed |
| **Background polling for JIRA updates** | ✅ Yes | ❌ No | Scheduled task, no user/AI involved |
| **Receive JIRA webhook (issue updated externally)** | ✅ Yes | ❌ No | Server-to-server, no AI context |
| **User clicks "Post Summary to JIRA"** | ✅ Yes | 🤔 Maybe | REST API for reliability; MCP could generate summary text |
| **AI answers "What JIRA issues am I assigned to?"** | ❌ No | ✅ Yes | Ad-hoc query during conversation |
| **AI answers "Show me issues with label 'bug'"** | ❌ No | ✅ Yes | Natural language query, AI can translate to JQL |
| **AI proactively suggests "This looks related to JIRA-123"** | ❌ No | ✅ Yes | AI pattern matching during conversation |
| **User asks "Link this workspace to JIRA issue"** | ✅ Yes | 🤔 Maybe | REST API for linking; MCP could help find issue |
| **Auto-log work time (if enabled)** | ✅ Yes | ❌ No | Scheduled/automatic, must be reliable |
| **User asks "What's blocking JIRA-456?"** | ❌ No | ✅ Yes | Conversational query, AI can fetch relationships |

**Key Principles**:

1. **Deterministic Operations → REST API**
   - User clicks button → action happens
   - Event triggers → action happens
   - No ambiguity, no AI interpretation

2. **Conversational Queries → MCP**
   - "Show me..." "What is..." "Find..."
   - AI translates natural language to JIRA operations
   - Results displayed in conversation, not persisted

3. **Background/Scheduled → REST API**
   - Polling for updates every 60 seconds
   - Webhook handlers
   - No user/AI in the loop

4. **Hybrid Example: "Post Summary"**
   - AI generates summary text (MCP or built-in LLM call)
   - User reviews/edits summary in UI
   - REST API posts comment to JIRA (deterministic)

### Example User Flows

#### Flow 1: User Starts Work (REST API Only)
```
1. User clicks "Start Work" on JIRA-linked task
2. Vibe Kanban creates workspace (no AI involved)
3. REST API client calls JIRA API:
   POST /rest/api/3/issue/PROJ-123/transitions
   { "transition": { "id": "31" } } // To "In Progress"
4. Success → local task status updated
5. Sync history logged
```

#### Flow 2: User Asks About JIRA (MCP Only)
```
1. User types in AI chat: "What high priority bugs are assigned to me?"
2. AI agent has access to JIRA MCP tools
3. AI translates to JQL: 'assignee = currentUser() AND priority = High AND type = Bug'
4. MCP tool queries JIRA REST API
5. AI formats results in natural language:
   "You have 3 high priority bugs:
    - PROJ-45: Login timeout
    - PROJ-67: Memory leak in parser
    - PROJ-89: Race condition in cache"
6. No database updates, purely conversational
```

#### Flow 3: User Posts Summary (Hybrid)
```
1. User clicks "Post Summary to JIRA" button
2. Vibe Kanban calls local LLM or uses MCP to generate summary:
   - Input: workspace changes, commits, files modified
   - Output: "Implemented JWT auth flow, added tests, updated docs"
3. UI shows summary in modal for user review/edit
4. User clicks "Post"
5. REST API client posts comment to JIRA:
   POST /rest/api/3/issue/PROJ-123/comment
   { "body": "[Posted by User via Vibe Kanban]\n\n{summary}" }
6. Success → close modal, show toast
```

### Why NOT to Use MCP for Core Sync

**Problem 1: Unreliability**
```typescript
// With MCP (BAD for critical operations)
async function onWorkspaceStart(task: Task) {
  // Send message to AI: "Update JIRA issue to In Progress"
  await ai.sendMessage(`Please update ${task.jiraKey} to In Progress`);
  // ❌ Did it work? Did AI understand? Did it use the tool?
  // ❌ User has no idea if sync happened
}

// With REST API (GOOD)
async function onWorkspaceStart(task: Task) {
  try {
    await jiraClient.transitionIssue(task.jiraKey, 'In Progress');
    await db.updateTaskSyncStatus(task.id, 'synced', new Date());
    showToast('JIRA issue updated to In Progress');
  } catch (error) {
    showToast('Failed to update JIRA: ' + error.message);
    // User knows immediately if something went wrong
  }
}
```

**Problem 2: Token Cost**
```
Scenario: User imports 50 JIRA issues

With MCP:
- 50 LLM calls to import issues
- Each call: ~500 tokens input + ~200 tokens output
- Total: 35,000 tokens = ~$0.50 (Claude Opus pricing)
- Time: 50 sequential LLM calls = ~50 seconds

With REST API:
- 1 JIRA API call (batch fetch)
- 50 database inserts
- Total cost: $0.00
- Time: ~2 seconds
```

**Problem 3: Background Operations**
```
Scenario: Poll JIRA every 60 seconds for updates

With MCP: Impossible
- Can't run scheduled LLM calls in background
- Would cost $100s/month in tokens for always-on polling
- No way to trigger MCP tools without user interaction

With REST API: Trivial
- Background thread polls JIRA every 60s
- Updates local cache
- Zero LLM cost
```

### Data Model Extensions

#### Local Database Schema Changes

```sql
-- Add JIRA metadata to tasks table
ALTER TABLE tasks ADD COLUMN jira_issue_key VARCHAR(50);
ALTER TABLE tasks ADD COLUMN jira_issue_id VARCHAR(50);
ALTER TABLE tasks ADD COLUMN jira_project_key VARCHAR(50);
ALTER TABLE tasks ADD COLUMN jira_metadata JSONB;
ALTER TABLE tasks ADD COLUMN last_jira_sync_at TIMESTAMP;

-- Index for JIRA lookups
CREATE INDEX idx_tasks_jira_issue_key ON tasks(jira_issue_key);
CREATE INDEX idx_tasks_last_jira_sync_at ON tasks(last_jira_sync_at);

-- JIRA connection configuration (per project)
CREATE TABLE jira_connections (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    jira_instance_url TEXT NOT NULL,
    jira_project_key VARCHAR(50) NOT NULL,
    auth_type VARCHAR(20) NOT NULL, -- 'oauth', 'api_token', 'cli'
    credentials_encrypted TEXT,
    webhook_secret TEXT,
    status_mapping JSONB NOT NULL DEFAULT '{}',
    sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sync_interval_seconds INTEGER DEFAULT 60,
    auto_status_sync BOOLEAN NOT NULL DEFAULT TRUE,
    auto_worklog_sync BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sync history for debugging and audit
CREATE TABLE jira_sync_history (
    id UUID PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    jira_connection_id UUID REFERENCES jira_connections(id) ON DELETE CASCADE,
    sync_direction VARCHAR(20) NOT NULL, -- 'jira_to_vk', 'vk_to_jira', 'bidirectional'
    sync_type VARCHAR(50) NOT NULL, -- 'status', 'description', 'comment', 'worklog'
    success BOOLEAN NOT NULL,
    error_message TEXT,
    synced_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Remote Database Schema (For Cloud Sync)

```sql
-- Extension metadata for JIRA integration (in remote issues table)
-- Already exists as extension_metadata JSONB field
-- Structure:
{
  "jira": {
    "instance_url": "https://company.atlassian.net",
    "issue_key": "PROJ-123",
    "issue_id": "10045",
    "project_key": "PROJ",
    "last_synced": "2025-01-29T12:00:00Z",
    "custom_fields": {
      "customfield_10001": "value"
    }
  }
}
```

### Sync Engine Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Vibe Kanban                           │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │          Sync Orchestrator                      │    │
│  │  - Polling scheduler                            │    │
│  │  - Webhook receiver                             │    │
│  │  - Conflict resolver                            │    │
│  └────────┬───────────────────────────────────────┘    │
│           │                                              │
│  ┌────────▼────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ JIRA API Client │  │ Local Cache │  │ Event Queue│  │
│  │ - REST calls    │  │ - Issues    │  │ - Pending  │  │
│  │ - Webhooks      │  │ - Metadata  │  │   updates  │  │
│  │ - Rate limiting │  │             │  │            │  │
│  └────────┬────────┘  └─────────────┘  └────────────┘  │
│           │                                              │
└───────────┼──────────────────────────────────────────────┘
            │
            │ HTTPS / OAuth 2.0
            ▼
┌──────────────────────────────────────────────────────────┐
│                  JIRA Cloud/Server                       │
│  - REST API v2/v3                                        │
│  - Webhooks                                              │
│  - Smart Commits                                         │
└──────────────────────────────────────────────────────────┘
```

### Authentication Flows

#### JIRA Cloud (OAuth 2.0)

```
1. User initiates connection in Vibe Kanban settings
2. Vibe Kanban redirects to JIRA authorization URL
3. User approves access (scopes: read:jira-work, write:jira-work)
4. JIRA redirects back with authorization code
5. Vibe Kanban exchanges code for access/refresh tokens
6. Tokens stored encrypted in local database
7. Refresh token used to maintain access
```

**Required Scopes**:
- `read:jira-work` - Read issues, projects, boards
- `write:jira-work` - Update issues, add comments, log work
- `read:jira-user` - Get user info for attribution

#### JIRA Server/Data Center (API Token or Basic Auth)

```
1. User generates API token in JIRA
2. User enters JIRA URL, email, and API token in Vibe Kanban
3. Vibe Kanban validates credentials with test API call
4. Credentials stored encrypted in local database
5. Basic Auth header used for all API requests
```

---

## Implementation Challenges

### 1. JIRA Workflow Complexity

**Challenge**: JIRA workflows are highly customizable with:
- Custom statuses per project
- Multiple transition paths between statuses
- Required fields on transitions
- Validators and post-functions

**Solutions**:
- **Workflow Introspection**: Use JIRA API to fetch available transitions for each status
- **Smart Mapping UI**: Show available JIRA transitions for each Vibe Kanban status
- **Validation**: Check required fields before transition, prompt user if needed
- **Graceful Degradation**: Fall back to comments if transition fails
- **User Control**: Allow manual override of automatic sync behavior

**Example**:
```javascript
// Fetch available transitions for current issue status
GET /rest/api/3/issue/{issueKey}/transitions

// Attempt transition with required fields
POST /rest/api/3/issue/{issueKey}/transitions
{
  "transition": { "id": "31" }, // Transition to "In Progress"
  "fields": {
    "assignee": { "id": "user123" } // Required field
  }
}
```

### 2. Bi-Directional Sync Conflicts

**Challenge**: When both JIRA and Vibe Kanban are updated simultaneously:
- Status changes conflict (JIRA: Done, Vibe Kanban: In Progress)
- Description/title edited in both places
- Comments added in both systems

**Solutions**:
- **Last-Write-Wins with Timestamp**: Use `updated_at` to determine source of truth
- **Conflict Detection UI**: Notify user of conflicts, show diff, allow resolution
- **JIRA as Source of Truth**: For critical fields (status, assignee), prefer JIRA state
- **Append-Only for Comments**: Sync all comments from both systems (no deletion)
- **Version Vectors**: Track sync version per field to detect conflicts

**Conflict Resolution Flow**:
```
1. Detect conflict (local updated_at > last_jira_sync_at)
2. Show notification: "JIRA issue PROJ-123 updated externally"
3. Present options:
   - Keep Vibe Kanban changes (overwrite JIRA)
   - Use JIRA changes (overwrite local)
   - Manual merge (show diff editor)
4. Log resolution in sync_history table
```

### 3. API Rate Limiting

**Challenge**: JIRA Cloud enforces strict rate limits:
- 10 requests per second per IP
- Burst limit of 100 concurrent requests
- 429 responses with Retry-After header

**Solutions**:
- **Request Batching**: Use batch API endpoints where available
- **Exponential Backoff**: Implement retry with exponential delay on 429
- **Local Caching**: Cache issue metadata, reduce redundant API calls
- **Smart Polling**: Only poll for issues with active workspaces
- **Webhook Priority**: Use webhooks to reduce polling frequency
- **User Awareness**: Show rate limit status, pause sync if limit reached

**Rate Limiter Implementation**:
```rust
struct JiraRateLimiter {
    requests_per_second: u32,
    token_bucket: TokenBucket,
    backoff_strategy: ExponentialBackoff,
}

impl JiraRateLimiter {
    async fn execute_request<T>(&self, request: Request) -> Result<T> {
        self.token_bucket.acquire().await?;
        match self.client.send(request).await {
            Ok(response) => Ok(response.json().await?),
            Err(e) if e.status() == 429 => {
                let retry_after = e.headers()
                    .get("Retry-After")
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60);
                sleep(retry_after).await;
                self.execute_request(request).await
            }
            Err(e) => Err(e)
        }
    }
}
```

### 4. Custom Field Mapping

**Challenge**: JIRA instances have custom fields with varied types:
- Text fields, dropdowns, multi-select
- Date pickers, number fields
- Custom field IDs vary per instance
- Some fields are required on create/transition

**Solutions**:
- **Field Discovery**: Use JIRA API to enumerate custom fields per project
- **Flexible Schema**: Store custom field values in JSONB `jira_metadata` column
- **Mapping UI**: Let users configure which custom fields to sync
- **Type Coercion**: Convert JIRA field types to Vibe Kanban equivalents
- **Validation**: Check required fields before creating/updating issues

**Custom Field Handling**:
```typescript
interface JiraCustomFieldMapping {
  jiraFieldId: string;         // "customfield_10001"
  jiraFieldName: string;       // "Story Points"
  jiraFieldType: string;       // "number", "option", "text"
  vibeKanbanField?: string;    // Optional: map to native field
  defaultValue?: any;          // Default if not provided
  required: boolean;
}

// Store in jira_connections.custom_field_mappings JSONB
```

### 5. Performance at Scale

**Challenge**: Large JIRA projects may have:
- Thousands of issues
- Hundreds of custom fields
- High-frequency updates

**Solutions**:
- **Incremental Sync**: Only fetch issues updated since last sync (JQL filter)
- **Pagination**: Fetch issues in batches of 50-100
- **Background Workers**: Run sync in separate thread/process
- **Selective Sync**: Only sync issues assigned to user or in active sprint
- **Compression**: Use gzip for large API responses
- **Database Indexing**: Index on `jira_issue_key`, `last_jira_sync_at`

**JQL for Incremental Sync**:
```
project = PROJ
AND updated >= -5m
AND (assignee = currentUser() OR sprint in openSprints())
ORDER BY updated DESC
```

### 6. Multi-Instance Support

**Challenge**: Enterprise users may work with multiple JIRA instances:
- Different Cloud tenants
- Mix of Cloud and Server
- Different projects per instance

**Solutions**:
- **Multiple Connections**: Support many `jira_connections` per Vibe Kanban project
- **Instance Selection UI**: Dropdown to choose JIRA instance when importing
- **Per-Task Instance Tracking**: Store `jira_instance_url` with each task
- **Connection Management**: Settings page to add/remove/edit JIRA connections

### 7. Webhook Security

**Challenge**: JIRA webhooks send updates to Vibe Kanban but need:
- Authentication (verify webhook is from JIRA)
- Authorization (webhook is for correct instance)
- Replay protection

**Solutions**:
- **Shared Secret**: Configure webhook secret in JIRA and Vibe Kanban
- **HMAC Validation**: Verify webhook signature using shared secret
- **IP Allowlist**: Only accept webhooks from JIRA IP ranges
- **Timestamp Validation**: Reject webhooks older than 5 minutes
- **Idempotency**: Handle duplicate webhook deliveries gracefully

**Webhook Validation**:
```rust
fn validate_jira_webhook(
    payload: &[u8],
    signature: &str,
    secret: &str
) -> bool {
    let expected = hmac_sha256(secret.as_bytes(), payload);
    constant_time_compare(&expected, signature.as_bytes())
}
```

---

## User Experience

### Settings / Configuration UI

```
┌─────────────────────────────────────────────────────────┐
│ JIRA Integration                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Connected Instances                             │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ ● company.atlassian.net (Cloud)                 │   │
│ │   Project: VIBE (Vibe Kanban)                   │   │
│ │   Auto-sync: On • Interval: 60s                 │   │
│ │   [Configure] [Disconnect]                      │   │
│ │                                                 │   │
│ │ + Add JIRA Connection                           │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ Status Mapping (VIBE project)                           │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Vibe Kanban Event  →  JIRA Transition           │   │
│ ├─────────────────────────────────────────────────┤   │
│ │ Start workspace    →  In Progress               │   │
│ │ (first time only)                               │   │
│ │ Mark as Done       →  Done                      │   │
│ │ Mark as Cancelled  →  Cancelled                 │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ Sync Preferences                                        │
│ ☑ Auto-sync status on workspace start (→ In Progress)  │
│ ☑ Auto-sync status when marking Done/Cancelled         │
│ ☐ Prompt to post summary when marking task as Done     │
│ ☐ Auto-log work time on task completion                │
│                                                         │
│ Display Options                                         │
│ ☑ Show JIRA labels in Vibe Kanban                      │
│ ☑ Show JIRA comments in task detail                    │
│ ☑ Link PRs in JIRA Development panel                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Task Import Flow

```
┌─────────────────────────────────────────────────────────┐
│ Import from JIRA                             [×]        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Project: [Vibe Kanban (VIBE) ▼]                        │
│                                                         │
│ Filter:                                                 │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Search issues... (JQL or text)                  │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ☐ My open issues                                       │
│ ☐ Current sprint                                       │
│ ☐ Recently updated                                     │
│                                                         │
│ Results (12 issues)                                     │
│ ┌─────────────────────────────────────────────────┐   │
│ │ ☐ VIBE-45  Add dark mode to settings           │   │
│ │    Priority: Medium • Status: To Do             │   │
│ │                                                 │   │
│ │ ☑ VIBE-46  Fix login timeout issue              │   │
│ │    Priority: High • Status: In Progress         │   │
│ │                                                 │   │
│ │ ☐ VIBE-47  Implement JIRA sync                  │   │
│ │    Priority: High • Status: To Do               │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [Select All]  [Import Selected (1 issue)]              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Task Detail View with JIRA Info

```
┌─────────────────────────────────────────────────────────┐
│ VIBE-46: Fix login timeout issue                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🔗 JIRA: company.atlassian.net/browse/VIBE-46          │
│    Status: In Progress • Priority: High                │
│    Assignee: John Doe • Sprint: Sprint 23              │
│    Last synced: 2 minutes ago [⟳ Sync Now]            │
│                                                         │
│ Description:                                            │
│ Users are experiencing timeout errors when attempting  │
│ to log in after idle sessions exceeding 30 minutes...  │
│                                                         │
│ Labels: auth, bug, customer-reported                   │
│                                                         │
│ ⚙️ Workspace                                            │
│ Status: In Progress • Agent: Claude Code               │
│ [Continue Work] [Create PR]                            │
│                                                         │
│ JIRA Actions                                            │
│ [Update JIRA Status ▼] [Post Summary to JIRA]         │
│ [Log Work Time...]                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Phased Rollout Plan

### Phase 1: Read-Only Sync (MVP)
**Timeline**: 4-6 weeks
- JIRA Cloud OAuth authentication
- Import JIRA issues as Vibe Kanban tasks
- Read-only sync of status, description, labels
- Display JIRA metadata in task detail view
- Basic error handling and logging

**Success Criteria**:
- 90% of JIRA issue imports succeed
- Sync latency < 10 seconds
- Users can work on JIRA issues in Vibe Kanban

### Phase 2: Bi-Directional Status Sync
**Timeline**: 4-6 weeks
- Push Vibe Kanban status changes to JIRA
- Configurable status mapping per project
- Conflict detection and resolution UI
- Automatic sync on workspace lifecycle events
- Webhook support for real-time JIRA → VK updates

**Success Criteria**:
- 95% of status transitions sync successfully
- Conflicts < 5% of syncs, resolved automatically
- Sync latency < 5 seconds with webhooks

### Phase 3: Rich Metadata Sync
**Timeline**: 3-4 weeks
- User-initiated comment posting (summary generation)
- Optional worklog creation with review/edit
- PR linking in JIRA Development panel
- Custom field mapping UI
- Epic and sprint integration

**Success Criteria**:
- Summary generation is accurate and concise
- Users can review/edit summaries before posting
- Worklogs accurately reflect coding time when user opts to log
- PRs visible in JIRA Development panel
- Read JIRA comments and display in task detail view

### Phase 4: Advanced Features
**Timeline**: 4-6 weeks
- JIRA Server/Data Center support
- Multi-instance management
- Bulk operations (import sprint, sync epic)
- Performance optimizations (caching, batching)
- Analytics and reporting integration

**Success Criteria**:
- Supports both Cloud and Server
- Handles projects with 10,000+ issues
- Batch import of 100 issues < 60 seconds

---

## Success Metrics

### Adoption Metrics
- Number of JIRA connections configured
- Percentage of tasks synced from JIRA
- Active users with JIRA integration enabled
- Time to first JIRA task import (onboarding)

### Quality Metrics
- Sync success rate (target: >95%)
- Sync latency p50/p99 (target: <5s / <30s)
- Conflict rate (target: <5%)
- API error rate (target: <1%)
- Webhook delivery success (target: >98%)

### Business Impact
- Reduction in manual task duplication time
- Increase in Vibe Kanban adoption at JIRA-using orgs
- User satisfaction (NPS) for JIRA integration feature
- Reduced churn for teams requiring JIRA compatibility

---

## Competitive Analysis

### Linear
- Sync with JIRA via Zapier or custom integrations
- One-way sync (Linear as source of truth)
- Limited workflow mapping

**Vibe Kanban Advantage**: Native bidirectional sync, AI coding agent integration

### Shortcut (formerly Clubhouse)
- JIRA import tool (one-time migration)
- No ongoing sync
- Manual workflow mapping

**Vibe Kanban Advantage**: Continuous sync, automatic status updates

### GitHub Issues / GitLab Issues
- No native JIRA sync
- Users manually reference JIRA keys in commits/PRs
- Third-party tools (Unito, Exalate) required

**Vibe Kanban Advantage**: Built-in sync, seamless workflow integration

---

## Open Questions

1. **Should we support JIRA Service Management (JSM)?**
   - JSM has different field schemas and workflows
   - May require separate integration logic
   - Customer demand unclear

2. **How to handle JIRA attachments?**
   - Download and store locally?
   - Link to JIRA attachments (requires auth)?
   - Read-only display?

3. **Should we sync Git branches/commits to JIRA?**
   - JIRA Development panel expects branch/commit data
   - Requires GitHub/GitLab integration in JIRA
   - May be redundant with PR linking

4. **How to handle JIRA issue deletion?**
   - Delete local task?
   - Mark as archived?
   - Notify user?

5. **Should we support JIRA filters/boards?**
   - Import issues from saved filters
   - Sync Kanban board configurations
   - Display JIRA boards in Vibe Kanban

---

## Conclusion

A JIRA integration would significantly lower the barrier to adoption for enterprise teams already invested in the JIRA ecosystem. While the implementation presents challenges around workflow complexity, sync conflicts, and API rate limits, these are solvable with thoughtful architecture and user experience design.

The phased rollout approach allows us to validate core value (read-only sync) before investing in complex bidirectional features. Success metrics focused on adoption, quality, and business impact will guide iterative improvements.

By positioning Vibe Kanban as a complementary tool that enhances (rather than replaces) JIRA, we can appeal to a broader market while maintaining our focus on AI-assisted development workflows.

---

## Appendix: API Reference

### JIRA REST API Endpoints

**Authentication**:
```
POST /rest/auth/1/session (Server/DC Basic Auth)
OAuth 2.0 (Cloud)
```

**Issue Operations**:
```
GET  /rest/api/3/issue/{issueKey}
POST /rest/api/3/issue
PUT  /rest/api/3/issue/{issueKey}
POST /rest/api/3/issue/{issueKey}/transitions
GET  /rest/api/3/issue/{issueKey}/comment
POST /rest/api/3/issue/{issueKey}/comment
POST /rest/api/3/issue/{issueKey}/worklog
```

**Project/Metadata**:
```
GET /rest/api/3/project/{projectKey}
GET /rest/api/3/project/{projectKey}/statuses
GET /rest/api/3/field
GET /rest/api/3/priority
```

**Search**:
```
POST /rest/api/3/search
Body: { "jql": "project = VIBE AND status = 'In Progress'" }
```

**Webhooks**:
```
POST /rest/webhooks/1.0/webhook
DELETE /rest/webhooks/1.0/webhook/{webhookId}
```

### Rate Limits

**JIRA Cloud**:
- 10 requests per second per IP
- 100 concurrent requests per app
- Exponential backoff on 429 responses

**JIRA Server/Data Center**:
- Configurable by admin (typically 50-100 req/sec)
- May vary by instance

---

**Document Version**: 1.0
**Last Updated**: 2026-01-29
**Author**: Claude (Vibe Kanban)
**Status**: Draft for Review
