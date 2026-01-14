# Multiplayer Implementation Plan

> **Scope**: Greenfield implementation - no backwards compatibility or data migration required.

## Overview

Transform Vibe Kanban from a single-user local application to a multi-user collaborative platform with GitHub SSO authentication.

### Goals
- Users authenticate via GitHub SSO
- All data is scoped to individual users
- UI displays which user performed each action
- Multiple users can collaborate on projects

### Current State
- **Local Mode**: Single anonymous user, no authentication, actions not attributed
- **Remote Mode**: Already has multi-user with OAuth (can reference patterns)
- **Existing Assets**: `UserAvatar` component, translation infrastructure, auth hooks exist

---

## Phase 1: User Authentication Flow ✅ COMPLETED

**Duration**: 4-5 days

**Status**: Completed - PR #2 merged

### What
Complete end-to-end GitHub SSO authentication - from clicking "Sign in" to being logged in with a session.

### Why
Authentication is the foundation. Nothing else can be scoped to users until we know who the user is.

### Tests

| Test | Type | Description |
|------|------|-------------|
| GitHub OAuth initiation returns valid authorization URL | Integration | Verify `/auth/github` returns a properly formatted GitHub OAuth URL with correct client_id, redirect_uri, and state parameter |
| OAuth callback creates user on first login | Integration | Mock GitHub token exchange and user API; verify new user record created in database with correct GitHub profile data |
| OAuth callback updates user on subsequent login | Integration | Existing user logs in again; verify profile data updated, same user ID retained |
| Invalid OAuth state rejected | Integration | Callback with mismatched state parameter returns 400 |
| Session token issued after successful auth | Integration | Verify JWT token returned after OAuth completion contains correct user ID and expiration |
| Valid session token returns user | Integration | Request to `/auth/me` with valid Bearer token returns user profile |
| Invalid session token returns 401 | Integration | Request with malformed/expired token returns 401 Unauthorized |
| Logout clears session | Integration | After logout, previously valid token returns 401 |
| Frontend redirects unauthenticated users to login | E2E | Visiting protected route without auth redirects to `/login` |
| Frontend stores token and loads user on OAuth callback | E2E | After OAuth redirect, token stored in localStorage, user displayed in UI |

### Changes Required

**Backend**
- ~~Users table migration (id, github_id, username, email, display_name, avatar_url, timestamps)~~ ✅
- ~~User model with find/upsert operations~~ ✅
- ~~GitHub OAuth service (auth URL generation, token exchange, profile fetch)~~ ✅
- ~~Session service (JWT creation, validation)~~ ✅
- ~~Auth routes (`/api/local-auth/github`, `/api/local-auth/github/callback`, `/api/local-auth/me`, `/api/local-auth/logout`)~~ ✅
- Auth middleware extractor for protected routes (deferred to Phase 2+)
- ~~LocalDeployment updates to hold auth services~~ ✅

**Frontend**
- ~~AuthContext for user state and token management~~ ✅
- ~~Login page with GitHub button~~ ✅
- OAuth callback handled via HTML response with localStorage (no separate page needed) ✅
- ProtectedRoute wrapper component (deferred to Phase 2+)
- ~~API client updates to include Authorization header~~ ✅

**Configuration**
- ~~Environment variables for GitHub OAuth credentials and session secret~~ ✅
- ~~`.env.example` documentation~~ ✅

---

## Phase 2: Project Ownership ✅ COMPLETED

**Duration**: 2-3 days

**Status**: Completed

### What
Projects are created by and belong to authenticated users.

### Why
Projects are the top-level container. Once projects have owners, we can scope everything inside them.

### Tests

| Test | Type | Description |
|------|------|-------------|
| Create project requires authentication | Integration | POST `/projects` without token returns 401 |
| Create project sets creator_user_id | Integration | Authenticated POST `/projects` creates project with current user as creator |
| Project response includes creator info | Integration | GET `/projects/:id` returns creator user details (id, username, avatar) |
| UI shows project creator | E2E | Project list/detail displays creator avatar and name |

### Changes Required

**Backend**
- ~~Migration to add `creator_user_id` column to projects table~~ ✅
- ~~Update Project model to include creator field~~ ✅
- ~~Update project create route to require auth and set creator~~ ✅
- ~~Update project query routes to join/include creator info~~ ✅

**Frontend**
- ~~Update project displays to show creator information~~ ✅
- ~~Ensure project creation goes through authenticated API client~~ ✅

---

## Phase 3: Task Attribution & Assignment ✅ COMPLETED

**Duration**: 2-3 days

**Status**: Completed

### What
Tasks track who created them and can be assigned to users.

### Why
Tasks are the core work unit. Knowing who created and who is responsible for a task enables collaboration.

### Tests

| Test | Type | Description |
|------|------|-------------|
| Create task requires authentication | Integration | POST `/tasks` without token returns 401 |
| Create task sets creator_user_id | Integration | Authenticated POST creates task with current user as creator |
| Task can be assigned to a user | Integration | PATCH `/tasks/:id` with assignee_user_id updates assignment |
| Task can be unassigned | Integration | PATCH with null assignee_user_id clears assignment |
| List users returns all users for assignment picker | Integration | GET `/users` returns list of users with id, username, avatar |
| Task response includes creator and assignee info | Integration | GET `/tasks/:id` returns full user details for creator and assignee |
| UI shows task creator on card | E2E | Task card displays creator avatar |
| UI shows assignee on card | E2E | Task card displays assignee avatar (or "Unassigned") |
| Assignee can be changed via UI | E2E | Assignee selector updates task assignment |

### Changes Required

**Backend**
- ~~Migration to add `creator_user_id` and `assignee_user_id` columns to tasks table~~ ✅
- ~~Update Task model with creator/assignee fields~~ ✅
- ~~Update task routes for auth and user attribution~~ ✅
- ~~Add users list route for assignment picker~~ ✅

**Frontend**
- ~~Update task cards to display creator and assignee avatars~~ ✅
- ~~Create AssigneeSelector component~~ ✅
- ~~Integrate assignee selection into task create/edit dialogs~~ ✅

---

## Phase 4: Workspace & Session Ownership

**Duration**: 2 days

### What
Workspaces and sessions track which user initiated them.

### Why
When an agent runs, we need to know which user triggered it. This enables showing "User X started this session" and attributing agent actions to the requesting user.

### Tests

| Test | Type | Description |
|------|------|-------------|
| Create workspace requires authentication | Integration | POST `/workspaces` without token returns 401 |
| Create workspace sets owner_user_id | Integration | Authenticated POST creates workspace with current user as owner |
| Create session sets initiated_by_user_id | Integration | Session creation records which user started it |
| Workspace/session responses include user info | Integration | Queries return owner/initiator details |
| UI shows who started a workspace session | E2E | Workspace view displays initiating user |

### Changes Required

**Backend**
- Migration to add `owner_user_id` to workspaces, `initiated_by_user_id` to sessions
- Update Workspace and Session models
- Update workspace/session routes for auth and user attribution

**Frontend**
- Display workspace owner in workspace views
- Show session initiator in session/execution views

---

## Phase 5: Chat Message Attribution

**Duration**: 3-4 days

### What
Chat messages in the conversation view show which user sent them.

### Why
In multi-user, multiple people may interact with the same agent session. The UI must show who said what - "You" for the current user, actual names for others.

### Tests

| Test | Type | Description |
|------|------|-------------|
| User message entries include sender info | Integration | When user sends message, normalized entry contains sender_user_id, sender_username, sender_avatar_url |
| Assistant messages have no sender | Integration | AI responses have null sender fields |
| Coding agent turn records user_id | Integration | Turn creation stores which user was interacting |
| Current user's messages show "You" | E2E | Messages from logged-in user display "You" label |
| Other users' messages show their name | E2E | Messages from other users display username and avatar |
| User avatar appears next to messages | E2E | User messages have avatar, assistant messages do not |

### Changes Required

**Backend**
- Migration to add `user_id` to coding_agent_turns table
- Extend NormalizedEntry type with sender fields (sender_user_id, sender_username, sender_avatar_url)
- Update log normalizers to populate sender info for user messages
- Thread user context through execution pipeline to normalizers
- Regenerate TypeScript types

**Frontend**
- Update ChatUserMessage to show sender info dynamically
- Update DisplayConversationEntry to render sender avatar/name
- Logic: if sender_user_id === current user → "You", else → username

---

## Phase 6: User Menu & Profile Display

**Duration**: 1-2 days

### What
Header displays current user with avatar and provides logout.

### Why
Users need visual confirmation of who they're logged in as and a way to sign out.

### Tests

| Test | Type | Description |
|------|------|-------------|
| User menu shows current user avatar and name | E2E | Logged-in user sees their avatar in header |
| User menu dropdown shows username | E2E | Clicking avatar shows dropdown with full name/username |
| Logout from menu clears session | E2E | Clicking logout redirects to login page, clears token |

### Changes Required

**Frontend**
- Create UserMenu component with avatar, dropdown, sign out option
- Add UserMenu to app header/navigation
- Wire logout action to auth context

---

## File Change Summary

### New Files

| Location | File | Purpose |
|----------|------|---------|
| `crates/db/migrations/` | Auth & users migration | Users table, user FK columns on all entities |
| `crates/db/src/models/` | `user.rs` | User model and queries |
| `crates/services/src/services/` | `github_auth.rs` | GitHub OAuth service |
| `crates/services/src/services/` | `session.rs` | JWT session service |
| `crates/server/src/routes/` | `github_auth.rs` | Auth API routes |
| `crates/server/src/routes/` | `users.rs` | User list route |
| `crates/server/src/middleware/` | `auth.rs` | Auth middleware extractor |
| `frontend/src/contexts/` | `AuthContext.tsx` | Auth state management |
| `frontend/src/pages/` | `Login.tsx` | Login page |
| `frontend/src/pages/` | `AuthCallback.tsx` | OAuth callback handler |
| `frontend/src/components/` | `ProtectedRoute.tsx` | Route protection wrapper |
| `frontend/src/components/` | `UserMenu.tsx` | User dropdown menu |
| `frontend/src/components/tasks/` | `AssigneeSelector.tsx` | Task assignee picker |

### Modified Files

| Location | File | Changes |
|----------|------|---------|
| `crates/db/src/models/` | `mod.rs` | Export user module |
| `crates/db/src/models/` | `project.rs` | Add creator_user_id |
| `crates/db/src/models/` | `task.rs` | Add creator/assignee fields |
| `crates/db/src/models/` | `workspace.rs` | Add owner_user_id |
| `crates/db/src/models/` | `session.rs` | Add initiated_by_user_id |
| `crates/db/src/models/` | `coding_agent_turn.rs` | Add user_id |
| `crates/local-deployment/src/` | `lib.rs` | Add auth services |
| `crates/server/src/routes/` | `mod.rs` | Mount new routes |
| `crates/server/src/routes/` | `projects/mod.rs` | Add auth, set creator |
| `crates/server/src/routes/` | `tasks.rs` | Add auth, set creator/assignee |
| `crates/server/src/routes/` | `workspaces.rs` | Add auth, set owner |
| `crates/server/src/routes/` | `sessions/mod.rs` | Add auth, set initiator |
| `crates/executors/src/` | Normalized entry type | Add sender fields |
| `crates/executors/src/executors/` | Log normalizers | Populate sender info |
| `shared/` | `types.ts` | Auto-regenerated |
| `frontend/src/` | `App.tsx` | Add AuthProvider, routes |
| `frontend/src/components/` | Chat message components | Display sender info |
| `frontend/src/components/tasks/` | Task card components | Show creator/assignee |
| `frontend/src/lib/api/` | `client.ts` | Add auth headers |
| Root | `.env.example` | Document OAuth config |

---

## Configuration Requirements

### GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App with:
   - Application name: `Vibe Kanban`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/local-auth/github/callback`
3. Note the Client ID and generate a Client Secret

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_CLIENT_ID` | OAuth app client ID from GitHub |
| `GITHUB_CLIENT_SECRET` | OAuth app client secret from GitHub |
| `SESSION_SECRET` | Random string (32+ chars) for signing JWT tokens |

---

## Timeline Summary

| Phase | Duration | Dependencies | Status |
|-------|----------|--------------|--------|
| Phase 1: User Authentication Flow | 4-5 days | None | ✅ Completed |
| Phase 2: Project Ownership | 2-3 days | Phase 1 | ✅ Completed |
| Phase 3: Task Attribution & Assignment | 2-3 days | Phase 1 | ✅ Completed |
| Phase 4: Workspace & Session Ownership | 2 days | Phase 1 | Ready |
| Phase 5: Chat Message Attribution | 3-4 days | Phase 4 | Blocked |
| Phase 6: User Menu & Profile Display | 1-2 days | Phase 1 | Ready |
| **Total** | **~2-3 weeks** | | |

Note: Phases 2, 3, 4, and 6 can run in parallel after Phase 1 completes. Phase 5 depends on Phase 4.

---

## Risk Areas & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OAuth flow complexity | Medium | Reference existing remote mode patterns in `crates/remote/` |
| Session security | High | Use established JWT libraries with secure defaults |
| User context threading to normalizers | Medium | Design execution pipeline to carry user context early |

---

## References

- Existing remote mode auth: `crates/remote/` (patterns to follow)
- Existing UserAvatar component: `frontend/src/components/tasks/UserAvatar.tsx`
- Existing auth hooks: `frontend/src/hooks/auth/`
- OAuth patterns: `crates/server/src/routes/oauth.rs` (current remote handoff)
