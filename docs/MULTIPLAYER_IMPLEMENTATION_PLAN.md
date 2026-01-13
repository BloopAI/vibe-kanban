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

## Phase 1: Database Schema & User Model

**Duration**: 1-2 days

### What
Create a users table and add user attribution to all existing entities.

### Why
Every action in the system needs to be traceable to a specific user. Without user identity at the data layer, we cannot implement any multi-user features.

### Changes Required

**New Migration: Users Table**
- Create `users` table with fields for GitHub identity (github_id, username, email, display_name, avatar_url)
- Index on `github_id` for OAuth lookups
- Index on `username` for display queries

**New Migration: User References**
Add user foreign keys to existing tables:

| Table | New Column(s) | Purpose |
|-------|---------------|---------|
| `projects` | `creator_user_id` (required) | Track who created the project |
| `tasks` | `creator_user_id` (required), `assignee_user_id` (optional) | Track creator and assignment |
| `workspaces` | `owner_user_id` (required) | Track workspace ownership |
| `sessions` | `initiated_by_user_id` (required) | Track who started the session |
| `coding_agent_turns` | `user_id` (required) | Track which user was interacting with the agent |

**New Model: User**
- Create `crates/db/src/models/user.rs` with CRUD operations
- Implement upsert logic for OAuth (create on first login, update profile on subsequent logins)
- Export module from `crates/db/src/models/mod.rs`

**Update Existing Models**
- Add new user fields to all affected model structs
- Update all create/update queries to accept and store user IDs
- Update TypeScript types via `pnpm run generate-types`

---

## Phase 2: GitHub OAuth Authentication

**Duration**: 3-4 days

### What
Implement GitHub SSO using OAuth 2.0 flow with secure session management.

### Why
GitHub SSO provides a trusted identity source that developers already use. It eliminates the need for password management and provides profile data (username, avatar) for display.

### Changes Required

**OAuth Service** (`crates/services/src/services/github_auth.rs`)
- OAuth 2.0 client configuration for GitHub
- Authorization URL generation with CSRF protection
- Code-to-token exchange
- GitHub API calls to fetch user profile

**Session Service** (`crates/services/src/services/session.rs`)
- JWT token creation with user ID as subject
- Token validation and expiration handling
- Configurable session duration (recommend 30 days)

**Auth Routes** (`crates/server/src/routes/github_auth.rs`)
- `GET /auth/github` - Initiate OAuth flow, return authorization URL
- `GET /auth/github/callback` - Handle OAuth callback, create/update user, issue session token
- `GET /auth/me` - Return current authenticated user
- `POST /auth/logout` - Clear session

**Auth Middleware** (`crates/server/src/middleware/auth.rs`)
- Request extractor that validates Bearer token from Authorization header
- Returns authenticated user or 401 Unauthorized
- Optional variant for endpoints that work with or without auth

**LocalDeployment Updates** (`crates/local-deployment/src/lib.rs`)
- Add GitHub auth service instance
- Add session service instance
- Add current user state management
- Add CSRF token storage for OAuth flow

**Configuration**
- Environment variables for GitHub OAuth credentials (client ID, secret)
- Environment variable for session signing secret
- Document setup in `.env.example`

---

## Phase 3: API Layer Updates

**Duration**: 2-3 days

### What
Require authentication on all API routes and pass user context to all data operations.

### Why
Every data modification must be attributed to the user who performed it. This enables audit trails, access control, and collaborative features.

### Changes Required

**Route Handler Updates**
Every route that creates or modifies data needs to:
1. Use the auth middleware extractor to get the current user
2. Pass the user ID to database operations

| Route File | Endpoints Affected |
|------------|-------------------|
| `routes/projects/mod.rs` | POST (create) - pass `creator_user_id` |
| `routes/tasks.rs` | POST (create) - pass `creator_user_id`; PATCH (update) - handle `assignee_user_id` |
| `routes/workspaces.rs` | POST (create) - pass `owner_user_id` |
| `routes/sessions/mod.rs` | POST (create) - pass `initiated_by_user_id` |
| `routes/sessions/coding_agent.rs` | POST (create turns) - pass `user_id` |

**New Routes** (`crates/server/src/routes/users.rs`)
- `GET /users` - List all users (for assignee selection)
- `GET /users/me` - Alias for `/auth/me`

**Router Updates** (`crates/server/src/routes/mod.rs`)
- Mount new auth routes
- Mount new user routes

---

## Phase 4: Message Attribution System

**Duration**: 2 days

### What
Extend the normalized conversation entry type to include sender information.

### Why
Chat messages currently display as generic "You" for all user messages. To show which user sent each message in a multi-user context, we need sender identity attached to each entry.

### Changes Required

**Extend NormalizedEntry Type**
Add new fields to the `NormalizedEntry` struct:
- `sender_user_id: Option<Uuid>` - The user who sent the message
- `sender_username: Option<String>` - Username for display
- `sender_avatar_url: Option<String>` - Avatar URL for display

These fields are optional because:
- System messages have no sender
- Assistant messages come from the AI, not a user
- Historical data (if any) won't have this info

**Update Log Normalizers**
All executor normalizers need to populate sender fields when creating user message entries:
- `crates/executors/src/executors/droid/normalize_logs.rs`
- Other executor normalizers as applicable

The normalizers need access to the current user context, which should be passed through the execution pipeline.

**Regenerate TypeScript Types**
Run `pnpm run generate-types` to update `shared/types.ts` with new fields.

---

## Phase 5: Frontend Authentication

**Duration**: 2-3 days

### What
Create authentication UI and state management in the React frontend.

### Why
Users need a way to log in, and the app needs to track authentication state to make authenticated API requests and display user-specific UI.

### Changes Required

**Auth Context** (`frontend/src/contexts/AuthContext.tsx`)
- Store current user state
- Store authentication token (persisted to localStorage)
- Provide login/logout functions
- Auto-fetch user profile on app load if token exists
- Handle token expiration/invalidation

**Login Page** (`frontend/src/pages/Login.tsx`)
- Simple page with GitHub login button
- Initiates OAuth flow via `/auth/github` endpoint

**Auth Callback Page** (`frontend/src/pages/AuthCallback.tsx`)
- Handles OAuth redirect
- Extracts token from URL
- Stores token and redirects to main app

**Protected Route Wrapper** (`frontend/src/components/ProtectedRoute.tsx`)
- Wraps routes that require authentication
- Redirects to login if not authenticated
- Shows loading state while checking auth

**API Client Updates** (`frontend/src/lib/api/client.ts`)
- Add Authorization header with Bearer token to all API requests
- Handle 401 responses (redirect to login)

**App Router Updates** (`frontend/src/App.tsx`)
- Wrap app in AuthProvider
- Add login and callback routes
- Wrap authenticated routes in ProtectedRoute

---

## Phase 6: Frontend Display Updates

**Duration**: 2-3 days

### What
Update UI components to display actual user information instead of generic labels.

### Why
The current UI shows "You" for all user messages and doesn't display user avatars. Multi-user requires showing who performed each action.

### Changes Required

**Chat Message Components**
Update to show sender information:
- `frontend/src/components/ui-new/primitives/conversation/ChatUserMessage.tsx`
- `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`
- `frontend/src/components/NormalizedConversation/UserMessage.tsx`

Logic needed:
- If `sender_user_id` matches current user → show "You"
- Otherwise → show sender's username
- Display sender's avatar alongside message

**User Menu Component** (new: `frontend/src/components/UserMenu.tsx`)
- Dropdown showing current user's avatar and name
- Sign out option
- Location: Header/navigation area

**Task Card Updates**
- `frontend/src/components/tasks/TaskCardHeader.tsx` - Already has UserAvatar support, ensure it displays creator and assignee

**Assignee Selector** (new: `frontend/src/components/tasks/AssigneeSelector.tsx`)
- Dropdown to select task assignee from list of users
- Shows user avatars and names
- Used in task create/edit dialogs

**Translation Updates**
- Verify `conversation.you` translation key is used correctly
- Add any new translation keys for user-related UI

---

## Phase 7: Testing & QA

**Duration**: 2-3 days

### What
Comprehensive testing of the new authentication and multi-user features.

### Why
Authentication is security-critical. Multi-user data scoping must be correct to prevent data leaks between users.

### Testing Areas

**Backend Unit Tests**
- User model CRUD operations
- Session token creation and validation
- OAuth flow helpers

**Backend Integration Tests**
- Full OAuth flow (mocked GitHub responses)
- Auth middleware rejects invalid tokens
- Routes return 401 without authentication
- Data operations correctly store user IDs

**Frontend Tests**
- AuthContext state management
- ProtectedRoute redirect behavior
- Login/logout flow

**Manual QA Checklist**
- [ ] GitHub OAuth login completes successfully
- [ ] User profile (name, avatar) displays correctly
- [ ] Logout clears session and redirects to login
- [ ] Creating a project sets current user as creator
- [ ] Creating a task sets current user as creator
- [ ] Task assignment can be changed
- [ ] Chat messages show correct sender name/avatar
- [ ] "You" displays for current user's messages
- [ ] Other users' messages show their username
- [ ] Session persists across browser refresh
- [ ] Expired/invalid tokens redirect to login
- [ ] API requests without token return 401

---

## File Change Summary

### New Files

| Location | File | Purpose |
|----------|------|---------|
| `crates/db/migrations/` | Users table migration | Create users table |
| `crates/db/migrations/` | User references migration | Add user FKs to existing tables |
| `crates/db/src/models/` | `user.rs` | User model and queries |
| `crates/services/src/services/` | `github_auth.rs` | GitHub OAuth service |
| `crates/services/src/services/` | `session.rs` | JWT session service |
| `crates/server/src/routes/` | `github_auth.rs` | Auth API routes |
| `crates/server/src/routes/` | `users.rs` | User API routes |
| `crates/server/src/middleware/` | `auth.rs` | Auth middleware |
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
| `crates/db/src/models/` | `project.rs` | Add creator_user_id field |
| `crates/db/src/models/` | `task.rs` | Add creator/assignee fields |
| `crates/db/src/models/` | `workspace.rs` | Add owner_user_id field |
| `crates/db/src/models/` | `session.rs` | Add initiated_by_user_id field |
| `crates/db/src/models/` | `coding_agent_turn.rs` | Add user_id field |
| `crates/local-deployment/src/` | `lib.rs` | Add auth services |
| `crates/server/src/routes/` | `mod.rs` | Mount new routes |
| `crates/server/src/routes/` | `projects/mod.rs` | Add auth, pass user_id |
| `crates/server/src/routes/` | `tasks.rs` | Add auth, pass user_id |
| `crates/server/src/routes/` | `workspaces.rs` | Add auth, pass user_id |
| `crates/server/src/routes/` | `sessions/mod.rs` | Add auth, pass user_id |
| `crates/executors/src/` | Normalized entry type | Add sender fields |
| `crates/executors/src/executors/` | Log normalizers | Populate sender fields |
| `shared/` | `types.ts` | Auto-regenerated |
| `frontend/src/` | `App.tsx` | Add AuthProvider, routes |
| `frontend/src/components/` | Chat message components | Display sender info |
| `frontend/src/components/tasks/` | `TaskCardHeader.tsx` | Show creator/assignee |
| `frontend/src/lib/api/` | `client.ts` | Add auth headers |
| Root | `.env.example` | Document OAuth config |

---

## Configuration Requirements

### GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App with:
   - Application name: `Vibe Kanban` (or your preferred name)
   - Homepage URL: `http://localhost:3000` (adjust for production)
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
3. Note the Client ID and generate a Client Secret

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_CLIENT_ID` | OAuth app client ID from GitHub |
| `GITHUB_CLIENT_SECRET` | OAuth app client secret from GitHub |
| `SESSION_SECRET` | Random string (32+ chars) for signing JWT tokens |

---

## Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Database | 1-2 days | None |
| Phase 2: Auth Backend | 3-4 days | Phase 1 |
| Phase 3: API Updates | 2-3 days | Phase 2 |
| Phase 4: Message Attribution | 2 days | Phase 1 |
| Phase 5: Frontend Auth | 2-3 days | Phase 2 |
| Phase 6: Frontend Display | 2-3 days | Phase 4, 5 |
| Phase 7: Testing | 2-3 days | All phases |
| **Total** | **~2-3 weeks** | |

---

## Risk Areas & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OAuth flow complexity | Medium | Reference existing remote mode OAuth patterns |
| Session security | High | Use established JWT libraries, secure defaults |
| Breaking API changes | Low | Greenfield - no backwards compatibility needed |
| User context threading | Medium | Design middleware carefully, test thoroughly |

---

## References

- Existing remote mode auth: `crates/remote/` (patterns to follow)
- Existing UserAvatar component: `frontend/src/components/tasks/UserAvatar.tsx`
- Existing auth hooks: `frontend/src/hooks/auth/`
- OAuth patterns: `crates/server/src/routes/oauth.rs` (current remote handoff)
