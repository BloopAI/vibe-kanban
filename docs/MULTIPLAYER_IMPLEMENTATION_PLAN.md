# Multiplayer Implementation Plan

> **Scope**: Greenfield implementation - no backwards compatibility or data migration required.

## Overview

Transform Vibe Kanban from a single-user local application to a multi-user collaborative platform with GitHub SSO authentication.

### Goals
- Users authenticate via GitHub SSO
- All data is scoped to individual users
- UI displays which user performed each action
- Multiple users can collaborate on projects

---

## Phase 1: Database Schema & User Model

**Duration**: 1-2 days

### 1.1 Create Users Table Migration

**File**: `crates/db/migrations/YYYYMMDD000000_add_users_table.sql`

```sql
PRAGMA foreign_keys = ON;

-- Core users table
CREATE TABLE users (
    id              BLOB PRIMARY KEY,           -- UUID
    github_id       INTEGER NOT NULL UNIQUE,    -- GitHub user ID
    username        TEXT NOT NULL,              -- GitHub username
    email           TEXT,                       -- Email (may be null if private)
    display_name    TEXT,                       -- Full name from GitHub
    avatar_url      TEXT,                       -- GitHub avatar URL
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    last_login_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_username ON users(username);
```

### 1.2 Add User References to Existing Tables

**File**: `crates/db/migrations/YYYYMMDD000001_add_user_references.sql`

```sql
-- Projects: track who created the project
ALTER TABLE projects ADD COLUMN creator_user_id BLOB NOT NULL REFERENCES users(id);
CREATE INDEX idx_projects_creator_user_id ON projects(creator_user_id);

-- Tasks: track creator and optional assignee
ALTER TABLE tasks ADD COLUMN creator_user_id BLOB NOT NULL REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN assignee_user_id BLOB REFERENCES users(id);
CREATE INDEX idx_tasks_creator_user_id ON tasks(creator_user_id);
CREATE INDEX idx_tasks_assignee_user_id ON tasks(assignee_user_id);

-- Workspaces: track owner
ALTER TABLE workspaces ADD COLUMN owner_user_id BLOB NOT NULL REFERENCES users(id);
CREATE INDEX idx_workspaces_owner_user_id ON workspaces(owner_user_id);

-- Sessions: track who initiated the session
ALTER TABLE sessions ADD COLUMN initiated_by_user_id BLOB NOT NULL REFERENCES users(id);
CREATE INDEX idx_sessions_initiated_by_user_id ON sessions(initiated_by_user_id);

-- Coding agent turns: track which user was interacting
ALTER TABLE coding_agent_turns ADD COLUMN user_id BLOB NOT NULL REFERENCES users(id);
CREATE INDEX idx_coding_agent_turns_user_id ON coding_agent_turns(user_id);
```

### 1.3 Create User Model

**File**: `crates/db/src/models/user.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export)]
pub struct User {
    pub id: Uuid,
    pub github_id: i64,
    pub username: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub last_login_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateUser {
    pub github_id: i64,
    pub username: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

impl User {
    pub async fn find_by_id(db: &sqlx::SqlitePool, id: Uuid) -> sqlx::Result<Option<Self>> {
        sqlx::query_as("SELECT * FROM users WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await
    }

    pub async fn find_by_github_id(db: &sqlx::SqlitePool, github_id: i64) -> sqlx::Result<Option<Self>> {
        sqlx::query_as("SELECT * FROM users WHERE github_id = ?")
            .bind(github_id)
            .fetch_optional(db)
            .await
    }

    pub async fn upsert(db: &sqlx::SqlitePool, user: CreateUser) -> sqlx::Result<Self> {
        let id = Uuid::new_v4();
        sqlx::query_as(
            r#"
            INSERT INTO users (id, github_id, username, email, display_name, avatar_url)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(github_id) DO UPDATE SET
                username = excluded.username,
                email = excluded.email,
                display_name = excluded.display_name,
                avatar_url = excluded.avatar_url,
                last_login_at = datetime('now', 'subsec')
            RETURNING *
            "#
        )
        .bind(id)
        .bind(user.github_id)
        .bind(user.username)
        .bind(user.email)
        .bind(user.display_name)
        .bind(user.avatar_url)
        .fetch_one(db)
        .await
    }

    pub async fn list(db: &sqlx::SqlitePool) -> sqlx::Result<Vec<Self>> {
        sqlx::query_as("SELECT * FROM users ORDER BY username")
            .fetch_all(db)
            .await
    }
}
```

### 1.4 Update Existing Models

Add `creator_user_id`, `assignee_user_id`, `owner_user_id`, etc. fields to:

| File | Changes |
|------|---------|
| `crates/db/src/models/project.rs` | Add `creator_user_id: Uuid` field, update all queries |
| `crates/db/src/models/task.rs` | Add `creator_user_id: Uuid`, `assignee_user_id: Option<Uuid>` |
| `crates/db/src/models/workspace.rs` | Add `owner_user_id: Uuid` |
| `crates/db/src/models/session.rs` | Add `initiated_by_user_id: Uuid` |
| `crates/db/src/models/coding_agent_turn.rs` | Add `user_id: Uuid` |
| `crates/db/src/models/mod.rs` | Add `pub mod user;` |

---

## Phase 2: GitHub OAuth Authentication

**Duration**: 3-4 days

### 2.1 Add GitHub OAuth Dependencies

**File**: `crates/server/Cargo.toml`

```toml
[dependencies]
oauth2 = "4.4"
```

### 2.2 Create GitHub OAuth Service

**File**: `crates/services/src/services/github_auth.rs`

```rust
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
    basic::BasicClient,
    reqwest::async_http_client,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct GitHubAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub id: i64,
    pub login: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

pub struct GitHubAuthService {
    client: BasicClient,
}

impl GitHubAuthService {
    pub fn new(config: GitHubAuthConfig) -> Result<Self, oauth2::ConfigurationError> {
        let client = BasicClient::new(
            ClientId::new(config.client_id),
            Some(ClientSecret::new(config.client_secret)),
            AuthUrl::new("https://github.com/login/oauth/authorize".to_string())?,
            Some(TokenUrl::new("https://github.com/login/oauth/access_token".to_string())?),
        )
        .set_redirect_uri(RedirectUrl::new(config.redirect_uri)?);

        Ok(Self { client })
    }

    pub fn authorize_url(&self) -> (url::Url, CsrfToken) {
        self.client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new("user:email".to_string()))
            .add_scope(Scope::new("read:user".to_string()))
            .url()
    }

    pub async fn exchange_code(&self, code: String) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.client
            .exchange_code(AuthorizationCode::new(code))
            .request_async(async_http_client)
            .await?;

        Ok(token.access_token().secret().clone())
    }

    pub async fn get_user(&self, access_token: &str) -> Result<GitHubUser, reqwest::Error> {
        let client = reqwest::Client::new();
        client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "vibe-kanban")
            .send()
            .await?
            .json()
            .await
    }
}
```

### 2.3 Create Auth Routes

**File**: `crates/server/src/routes/github_auth.rs`

```rust
use axum::{
    Router,
    extract::{Query, State},
    http::StatusCode,
    response::{Json, Redirect},
    routing::get,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct AuthUrlResponse {
    pub url: String,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/github", get(github_login))
        .route("/auth/github/callback", get(github_callback))
        .route("/auth/me", get(get_current_user))
        .route("/auth/logout", post(logout))
}

/// GET /auth/github - Initiate GitHub OAuth flow
async fn github_login(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<AuthUrlResponse>, ApiError> {
    let github_auth = deployment.github_auth()?;
    let (url, csrf_token) = github_auth.authorize_url();

    // Store CSRF token for verification
    deployment.store_csrf_token(csrf_token.secret().clone()).await;

    Ok(Json(AuthUrlResponse { url: url.to_string() }))
}

/// GET /auth/github/callback - Handle OAuth callback
async fn github_callback(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<CallbackQuery>,
) -> Result<Redirect, ApiError> {
    // Verify CSRF token
    if !deployment.verify_csrf_token(&query.state).await {
        return Err(ApiError::BadRequest("Invalid state parameter".into()));
    }

    let github_auth = deployment.github_auth()?;

    // Exchange code for access token
    let access_token = github_auth.exchange_code(query.code).await
        .map_err(|e| ApiError::BadRequest(format!("Token exchange failed: {}", e)))?;

    // Get GitHub user info
    let github_user = github_auth.get_user(&access_token).await
        .map_err(|e| ApiError::BadRequest(format!("Failed to get user: {}", e)))?;

    // Upsert user in database
    let user = db::models::user::User::upsert(
        deployment.db().pool(),
        db::models::user::CreateUser {
            github_id: github_user.id,
            username: github_user.login,
            email: github_user.email,
            display_name: github_user.name,
            avatar_url: github_user.avatar_url,
        }
    ).await.map_err(ApiError::from)?;

    // Create session token (JWT)
    let session_token = deployment.create_session_token(&user).await?;

    // Store session
    deployment.store_session(user.id, session_token.clone()).await;

    // Redirect to frontend with token
    Ok(Redirect::to(&format!("/auth/complete?token={}", session_token)))
}

/// GET /auth/me - Get current authenticated user
async fn get_current_user(
    State(deployment): State<DeploymentImpl>,
    // Extract user from auth middleware (see Phase 2.4)
    user: AuthenticatedUser,
) -> Result<Json<AuthenticatedUser>, ApiError> {
    Ok(Json(user))
}

/// POST /auth/logout - Clear session
async fn logout(
    State(deployment): State<DeploymentImpl>,
    user: AuthenticatedUser,
) -> Result<StatusCode, ApiError> {
    deployment.clear_session(user.id).await;
    Ok(StatusCode::NO_CONTENT)
}
```

### 2.4 Create Auth Middleware

**File**: `crates/server/src/middleware/auth.rs`

```rust
use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode, header},
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Extractor for authenticated user
pub struct AuthUser(pub db::models::user::User);

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    DeploymentImpl: FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let deployment = DeploymentImpl::from_ref(state);

        // Extract Bearer token from Authorization header
        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "))
            .ok_or(ApiError::Unauthorized)?;

        // Validate token and get user ID
        let user_id = deployment
            .validate_session_token(auth_header)
            .await
            .map_err(|_| ApiError::Unauthorized)?;

        // Fetch user from database
        let user = db::models::user::User::find_by_id(deployment.db().pool(), user_id)
            .await
            .map_err(ApiError::from)?
            .ok_or(ApiError::Unauthorized)?;

        Ok(AuthUser(user))
    }
}

/// Optional auth extractor (for endpoints that work with or without auth)
pub struct OptionalAuthUser(pub Option<db::models::user::User>);

impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
    DeploymentImpl: FromRef<S>,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(AuthUser(user)) => Ok(OptionalAuthUser(Some(user))),
            Err(_) => Ok(OptionalAuthUser(None)),
        }
    }
}
```

### 2.5 Session Token Management

**File**: `crates/services/src/services/session.rs`

```rust
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionClaims {
    pub sub: Uuid,        // User ID
    pub exp: i64,         // Expiration time
    pub iat: i64,         // Issued at
}

pub struct SessionService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
}

impl SessionService {
    pub fn new(secret: &[u8]) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret),
            decoding_key: DecodingKey::from_secret(secret),
        }
    }

    pub fn create_token(&self, user_id: Uuid) -> Result<String, jsonwebtoken::errors::Error> {
        let now = Utc::now();
        let claims = SessionClaims {
            sub: user_id,
            exp: (now + Duration::days(30)).timestamp(),
            iat: now.timestamp(),
        };

        encode(&Header::default(), &claims, &self.encoding_key)
    }

    pub fn validate_token(&self, token: &str) -> Result<Uuid, jsonwebtoken::errors::Error> {
        let token_data = decode::<SessionClaims>(
            token,
            &self.decoding_key,
            &Validation::default(),
        )?;

        Ok(token_data.claims.sub)
    }
}
```

### 2.6 Update LocalDeployment

**File**: `crates/local-deployment/src/lib.rs`

Add to `LocalDeployment` struct:

```rust
pub struct LocalDeployment {
    // ... existing fields ...
    github_auth: Option<GitHubAuthService>,
    session_service: SessionService,
    current_user: Arc<RwLock<Option<User>>>,
    csrf_tokens: Arc<RwLock<HashSet<String>>>,
}

impl LocalDeployment {
    // Add methods for auth
    pub fn github_auth(&self) -> Result<&GitHubAuthService, ApiError> {
        self.github_auth.as_ref().ok_or(ApiError::NotConfigured("GitHub auth not configured"))
    }

    pub fn current_user(&self) -> Option<User> {
        self.current_user.blocking_read().clone()
    }

    pub async fn set_current_user(&self, user: Option<User>) {
        *self.current_user.write().await = user;
    }

    pub async fn store_csrf_token(&self, token: String) {
        self.csrf_tokens.write().await.insert(token);
    }

    pub async fn verify_csrf_token(&self, token: &str) -> bool {
        self.csrf_tokens.write().await.remove(token)
    }

    pub async fn create_session_token(&self, user: &User) -> Result<String, ApiError> {
        self.session_service.create_token(user.id).map_err(|e| ApiError::Internal(e.to_string()))
    }

    pub async fn validate_session_token(&self, token: &str) -> Result<Uuid, ApiError> {
        self.session_service.validate_token(token).map_err(|_| ApiError::Unauthorized)
    }
}
```

### 2.7 Environment Configuration

**File**: `.env.example`

```bash
# GitHub OAuth (required for multiplayer)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback

# Session secret (generate a random 32+ character string)
SESSION_SECRET=your_random_secret_here
```

---

## Phase 3: API Layer Updates

**Duration**: 2-3 days

### 3.1 Update All Route Handlers

Every route that creates or modifies data needs to:
1. Extract the authenticated user via `AuthUser` extractor
2. Pass `user.id` to database operations

**Example**: `crates/server/src/routes/projects/mod.rs`

```rust
// Before
async fn create_project(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<Project>, ApiError> {
    let project = Project::create(deployment.db().pool(), payload).await?;
    Ok(Json(project))
}

// After
async fn create_project(
    State(deployment): State<DeploymentImpl>,
    AuthUser(user): AuthUser,  // NEW: Extract authenticated user
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<Project>, ApiError> {
    let project = Project::create(
        deployment.db().pool(),
        payload,
        user.id,  // NEW: Pass user ID as creator
    ).await?;
    Ok(Json(project))
}
```

### 3.2 Routes Requiring Updates

| Route File | Endpoints | Changes |
|------------|-----------|---------|
| `routes/projects/mod.rs` | POST /projects | Add `creator_user_id` |
| `routes/tasks.rs` | POST /tasks | Add `creator_user_id`, optional `assignee_user_id` |
| `routes/tasks.rs` | PATCH /tasks/:id | Track who modified, allow assignee changes |
| `routes/workspaces.rs` | POST /workspaces | Add `owner_user_id` |
| `routes/sessions/mod.rs` | POST /sessions | Add `initiated_by_user_id` |
| `routes/sessions/coding_agent.rs` | POST coding agent turns | Add `user_id` |

### 3.3 Add User Routes

**File**: `crates/server/src/routes/users.rs`

```rust
use axum::{Router, routing::get, extract::State, Json};
use crate::{DeploymentImpl, error::ApiError, middleware::auth::AuthUser};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/users", get(list_users))
        .route("/users/me", get(get_current_user))
}

async fn list_users(
    State(deployment): State<DeploymentImpl>,
    AuthUser(_): AuthUser,
) -> Result<Json<Vec<db::models::user::User>>, ApiError> {
    let users = db::models::user::User::list(deployment.db().pool()).await?;
    Ok(Json(users))
}

async fn get_current_user(
    AuthUser(user): AuthUser,
) -> Json<db::models::user::User> {
    Json(user)
}
```

---

## Phase 4: Message Attribution System

**Duration**: 2 days

### 4.1 Update NormalizedEntry Type

**File**: `crates/executors/src/normalized_entry.rs` (or equivalent)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,

    // NEW: User attribution
    pub sender_user_id: Option<Uuid>,
    pub sender_username: Option<String>,
    pub sender_avatar_url: Option<String>,

    // ... existing fields
}
```

### 4.2 Update Log Normalizers

**Files to update**:
- `crates/executors/src/executors/droid/normalize_logs.rs`
- `crates/executors/src/executors/*/normalize_logs.rs` (all executors)

When creating `NormalizedEntry` for user messages:

```rust
fn normalize_user_message(content: &str, user: &User) -> NormalizedEntry {
    NormalizedEntry {
        timestamp: Some(Utc::now().to_rfc3339()),
        entry_type: NormalizedEntryType::UserMessage,
        content: content.to_string(),
        sender_user_id: Some(user.id),
        sender_username: Some(user.username.clone()),
        sender_avatar_url: user.avatar_url.clone(),
        // ... other fields
    }
}
```

### 4.3 Update TypeScript Types

Run `pnpm run generate-types` after Rust changes to regenerate `shared/types.ts`.

Expected changes:

```typescript
// shared/types.ts (auto-generated)
export type NormalizedEntry = {
  timestamp: string | null;
  entry_type: NormalizedEntryType;
  content: string;
  sender_user_id: string | null;      // NEW
  sender_username: string | null;      // NEW
  sender_avatar_url: string | null;    // NEW
  // ... existing fields
}
```

---

## Phase 5: Frontend Authentication

**Duration**: 2-3 days

### 5.1 Create Auth Context

**File**: `frontend/src/contexts/AuthContext.tsx`

```tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@shared/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('auth_token')
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.data);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('auth_token');
        setToken(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    const response = await fetch('/api/auth/github');
    const data = await response.json();
    window.location.href = data.url;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 5.2 Create Auth Callback Handler

**File**: `frontend/src/pages/AuthCallback.tsx`

```tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('auth_token', token);
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

  return <div>Completing authentication...</div>;
}
```

### 5.3 Create Login Page

**File**: `frontend/src/pages/Login.tsx`

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';

export function LoginPage() {
  const { login, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-3xl font-bold">Welcome to Vibe Kanban</h1>
        <p className="text-muted-foreground">Sign in to get started</p>
        <Button onClick={login} disabled={isLoading} size="lg">
          <Github className="mr-2 h-5 w-5" />
          Sign in with GitHub
        </Button>
      </div>
    </div>
  );
}
```

### 5.4 Create Protected Route Wrapper

**File**: `frontend/src/components/ProtectedRoute.tsx`

```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

### 5.5 Update API Client

**File**: `frontend/src/lib/api/client.ts`

```typescript
// Add auth header to all API requests
export function createAuthenticatedFetch() {
  return async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('auth_token');

    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, { ...options, headers });
  };
}

export const authFetch = createAuthenticatedFetch();
```

---

## Phase 6: Frontend Display Updates

**Duration**: 2-3 days

### 6.1 Update Chat Message Components

**File**: `frontend/src/components/ui-new/primitives/conversation/ChatUserMessage.tsx`

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { NormalizedEntry } from '@shared/types';
import { UserAvatar } from '@/components/tasks/UserAvatar';

interface ChatUserMessageProps {
  entry: NormalizedEntry;
}

export function ChatUserMessage({ entry }: ChatUserMessageProps) {
  const { user: currentUser } = useAuth();

  const isCurrentUser = entry.sender_user_id === currentUser?.id;
  const displayName = isCurrentUser
    ? t('conversation.you')
    : entry.sender_username || 'Unknown User';

  return (
    <ChatEntryContainer variant="user">
      <div className="flex items-center gap-2">
        <UserAvatar
          username={entry.sender_username}
          imageUrl={entry.sender_avatar_url}
          className="h-6 w-6"
        />
        <span className="font-medium">{displayName}</span>
      </div>
      <ChatMarkdown>{entry.content}</ChatMarkdown>
    </ChatEntryContainer>
  );
}
```

### 6.2 Update Conversation Entry Display

**File**: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`

Update to use sender information from `NormalizedEntry`:

```tsx
function getUserDisplay(entry: NormalizedEntry, currentUserId: string | undefined) {
  if (entry.entry_type.type !== 'user_message' && entry.entry_type.type !== 'user_feedback') {
    return null;
  }

  const isCurrentUser = entry.sender_user_id === currentUserId;

  return {
    name: isCurrentUser ? t('conversation.you') : entry.sender_username || 'User',
    avatarUrl: entry.sender_avatar_url,
    isCurrentUser,
  };
}
```

### 6.3 Add User Menu Component

**File**: `frontend/src/components/UserMenu.tsx`

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-1 hover:bg-accent">
          <UserAvatar
            username={user.username}
            imageUrl={user.avatar_url}
            displayName={user.display_name}
            className="h-8 w-8"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5">
          <p className="font-medium">{user.display_name || user.username}</p>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 6.4 Update Task Cards

**File**: `frontend/src/components/tasks/TaskCardHeader.tsx`

Already has `UserAvatar` support - ensure it displays:
- Creator avatar/name
- Assignee avatar/name (if assigned)

### 6.5 Add Assignee Selector

**File**: `frontend/src/components/tasks/AssigneeSelector.tsx`

```tsx
import { useState, useEffect } from 'react';
import { User } from '@shared/types';
import { UserAvatar } from './UserAvatar';
import { authFetch } from '@/lib/api/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AssigneeSelectorProps {
  value: string | null;
  onChange: (userId: string | null) => void;
}

export function AssigneeSelector({ value, onChange }: AssigneeSelectorProps) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    authFetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data.data));
  }, []);

  return (
    <Select value={value || 'unassigned'} onValueChange={(v) => onChange(v === 'unassigned' ? null : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {users.map(user => (
          <SelectItem key={user.id} value={user.id}>
            <div className="flex items-center gap-2">
              <UserAvatar username={user.username} imageUrl={user.avatar_url} className="h-5 w-5" />
              {user.display_name || user.username}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

---

## Phase 7: Testing & QA

**Duration**: 2-3 days

### 7.1 Backend Tests

**File**: `crates/db/src/models/user.rs` (test module)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[sqlx::test]
    async fn test_user_upsert(pool: SqlitePool) {
        let user = User::upsert(&pool, CreateUser {
            github_id: 12345,
            username: "testuser".into(),
            email: Some("test@example.com".into()),
            display_name: Some("Test User".into()),
            avatar_url: None,
        }).await.unwrap();

        assert_eq!(user.github_id, 12345);
        assert_eq!(user.username, "testuser");

        // Test upsert updates existing
        let updated = User::upsert(&pool, CreateUser {
            github_id: 12345,
            username: "newusername".into(),
            email: None,
            display_name: None,
            avatar_url: None,
        }).await.unwrap();

        assert_eq!(updated.id, user.id);  // Same user
        assert_eq!(updated.username, "newusername");  // Updated
    }
}
```

### 7.2 Integration Tests

- Test OAuth flow end-to-end
- Test that all routes require authentication
- Test that data is properly scoped to users
- Test session token creation and validation

### 7.3 Frontend Tests

- Test AuthContext behavior
- Test ProtectedRoute redirects
- Test user display in messages
- Test login/logout flow

### 7.4 Manual QA Checklist

- [ ] GitHub OAuth login works
- [ ] User profile displays correctly
- [ ] Logout clears session
- [ ] Projects created with user as creator
- [ ] Tasks created with user as creator
- [ ] Task assignment works
- [ ] Chat messages show correct sender
- [ ] User avatars display correctly
- [ ] Session persists across page reloads
- [ ] Invalid tokens redirect to login

---

## File Change Summary

### New Files

| File | Description |
|------|-------------|
| `crates/db/migrations/YYYYMMDD000000_add_users_table.sql` | Users table |
| `crates/db/migrations/YYYYMMDD000001_add_user_references.sql` | User FK columns |
| `crates/db/src/models/user.rs` | User model |
| `crates/services/src/services/github_auth.rs` | GitHub OAuth service |
| `crates/services/src/services/session.rs` | Session/JWT service |
| `crates/server/src/routes/github_auth.rs` | GitHub auth routes |
| `crates/server/src/routes/users.rs` | User API routes |
| `crates/server/src/middleware/auth.rs` | Auth middleware/extractors |
| `frontend/src/contexts/AuthContext.tsx` | Auth React context |
| `frontend/src/pages/Login.tsx` | Login page |
| `frontend/src/pages/AuthCallback.tsx` | OAuth callback handler |
| `frontend/src/components/ProtectedRoute.tsx` | Route protection |
| `frontend/src/components/UserMenu.tsx` | User dropdown menu |
| `frontend/src/components/tasks/AssigneeSelector.tsx` | Task assignee picker |

### Modified Files

| File | Changes |
|------|---------|
| `crates/db/src/models/mod.rs` | Add `user` module |
| `crates/db/src/models/project.rs` | Add `creator_user_id` |
| `crates/db/src/models/task.rs` | Add `creator_user_id`, `assignee_user_id` |
| `crates/db/src/models/workspace.rs` | Add `owner_user_id` |
| `crates/db/src/models/session.rs` | Add `initiated_by_user_id` |
| `crates/db/src/models/coding_agent_turn.rs` | Add `user_id` |
| `crates/local-deployment/src/lib.rs` | Add auth services |
| `crates/server/src/routes/mod.rs` | Mount new routes |
| `crates/server/src/routes/projects/mod.rs` | Add auth, pass user_id |
| `crates/server/src/routes/tasks.rs` | Add auth, pass user_id |
| `crates/server/src/routes/workspaces.rs` | Add auth, pass user_id |
| `crates/server/src/routes/sessions/mod.rs` | Add auth, pass user_id |
| `crates/executors/src/normalized_entry.rs` | Add sender fields |
| `crates/executors/src/executors/*/normalize_logs.rs` | Populate sender |
| `shared/types.ts` | Auto-generated with new fields |
| `frontend/src/App.tsx` | Add AuthProvider, routes |
| `frontend/src/components/ui-new/primitives/conversation/ChatUserMessage.tsx` | Dynamic sender |
| `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` | Sender display |
| `frontend/src/components/tasks/TaskCardHeader.tsx` | Show creator/assignee |
| `frontend/src/lib/api/client.ts` | Add auth headers |
| `.env.example` | Add GitHub OAuth vars |

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

## Configuration Requirements

### GitHub OAuth App Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App:
   - Application name: `Vibe Kanban`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
3. Copy Client ID and Client Secret to `.env`

### Environment Variables

```bash
# Required for multiplayer
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
SESSION_SECRET=random-32-char-string
```
