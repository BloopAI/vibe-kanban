# JIRA Integration - Feature Proposal

## Executive Summary

This document proposes a JIRA integration for Vibe Kanban that would enable users to work on JIRA issues using AI coding agents while keeping JIRA as the source of truth for project management. The integration focuses on reducing workflow fragmentation and maintaining visibility for stakeholders who rely on JIRA for tracking development work.

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

### Phase 1: Import and View (MVP)
**Scope**: Enable users to import JIRA issues and view them in Vibe Kanban
- Connect to JIRA Cloud instances (authentication)
- Import individual JIRA issues as Vibe Kanban tasks
- Display JIRA metadata (status, priority, labels, description, assignee)
- Link back to JIRA issue from task detail view
- Filter and search JIRA issues when importing

**Success Criteria**:
- Users can successfully connect to their JIRA instance
- Imported issues retain all key information
- Users can work on JIRA issues using AI coding agents

### Phase 2: Status Synchronization
**Scope**: Keep JIRA and Vibe Kanban statuses in sync
- Update JIRA status when workspace starts ("In Progress")
- Update JIRA status when task marked as Done/Cancelled
- Configurable status mapping per project
- Handle conflicts when both systems updated
- Show sync status in UI (when last synced, any errors)

**Success Criteria**:
- Status changes reliably sync between systems
- Users understand when syncs happen
- Conflicts are detected and user can resolve them

### Phase 3: Rich Interactions
**Scope**: Enable richer information exchange with JIRA
- Post work summaries to JIRA as comments (user-initiated)
- Log work time to JIRA (user-initiated, with review)
- Link PRs to JIRA issues
- View JIRA comments in Vibe Kanban
- Import/view epic and sprint information

**Success Criteria**:
- Users can share progress with JIRA stakeholders
- Work tracking in JIRA reflects AI-assisted development
- Context from JIRA visible within Vibe Kanban

### Phase 4: Enterprise Features
**Scope**: Support for enterprise JIRA deployments
- JIRA Server/Data Center support
- Multiple JIRA instance connections
- Bulk operations (import entire sprint, filter by epic)
- Custom field mapping
- Advanced search and filtering

**Success Criteria**:
- Works with on-premise JIRA deployments
- Users with multiple JIRA instances can manage them
- Large-scale JIRA projects perform well

---

## Success Metrics

### User Adoption
- Percentage of Vibe Kanban users who enable JIRA integration
- Number of JIRA issues worked on in Vibe Kanban
- Daily active users working on JIRA-linked tasks

### User Experience
- Users report the integration "just works" without manual intervention
- Stakeholders can track work progress in JIRA without asking developers
- Developers don't need to update JIRA manually after using AI agents

### Business Impact
- Increased Vibe Kanban adoption at JIRA-using organizations
- Reduced time spent on status updates and progress reporting
- Higher user satisfaction scores for teams using both tools

---

## Open Questions

1. **Should we support JIRA Service Management (JSM)?**
   - JSM is used for support tickets, not development work
   - Different use case from software development issues
   - Need to validate customer demand

2. **How should JIRA attachments work?**
   - Should users be able to view attachments from within Vibe Kanban?
   - Or is linking to JIRA for attachment viewing acceptable?

3. **What happens when a JIRA issue is deleted?**
   - Should the Vibe Kanban task be automatically deleted?
   - Or archived with a note that the JIRA issue was removed?

4. **Should we support JIRA filters and boards?**
   - Would users want to import all issues from a saved JIRA filter?
   - Should Vibe Kanban mirror JIRA board structure?
   - Or is manual import sufficient?

5. **What level of custom field support is needed?**
   - JIRA instances often have dozens of custom fields
   - Which fields are most important to sync?
   - Should this be user-configurable?

---

## Conclusion

A JIRA integration would significantly lower the barrier to adoption for enterprise teams already invested in the JIRA ecosystem. By enabling developers to use AI coding agents while keeping JIRA as the source of truth, Vibe Kanban becomes a complementary tool rather than a replacement.

The phased rollout approach allows us to validate core value (import and view) before adding more complex features (bidirectional sync, rich interactions). Starting simple and expanding based on user feedback ensures we build what users actually need.

This integration positions Vibe Kanban uniquely in the market: the only tool that combines AI-assisted development with seamless JIRA integration, rather than forcing teams to choose between the two.

---

**Document Version**: 1.0
**Last Updated**: 2026-01-29
**Authors**: David Van Couvering (david.vancouvering@gmail.com), Claude (Vibe Kanban)
**Status**: Draft for Review
