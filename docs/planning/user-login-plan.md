# User Login Implementation Plan

## Task
Implement user authentication using existing OAuth handoff flow.

## Backend
Already implemented in `crates/server/src/routes/oauth.rs`:
- `POST /api/auth/handoff/init` - Initialize OAuth
- `GET /api/auth/handoff/complete` - OAuth callback
- `GET /api/auth/status` - Check login status
- `POST /api/auth/logout` - Logout

## Frontend Changes

### 1. Create Login Modal Component
**File:** `frontend/src/components/dialogs/LoginDialog.tsx`

```
- Dialog with title "Sign in to Vibe Kanban"
- Subtitle: "Sign in to join organizations and share tasks with your team"
- "Continue with GitHub" button
- "Continue with Google" button
- Cancel button
```

### 2. Create useAuth Hook
**File:** `frontend/src/hooks/useAuth.ts`

```
- login(provider: 'github' | 'google')
- logout()
- status: { loggedIn, profile }
- isLoading
```

### 3. Add Auth API Functions
**File:** `frontend/src/lib/api.ts`

```
authApi.handoffInit(provider, returnTo)
authApi.status()
authApi.logout()
```

### 4. Update Organization Settings Page
**File:** `frontend/src/pages/SettingsOrganizations.tsx`

```
- Check auth status on mount
- Show LoginDialog when clicking Login button
- Show logged-in UI when authenticated
```

## Implementation Steps

1. Add auth API functions to `frontend/src/lib/api.ts`
2. Create `useAuth` hook
3. Create `LoginDialog` component
4. Integrate login in Settings page
5. Add auth state to app context
