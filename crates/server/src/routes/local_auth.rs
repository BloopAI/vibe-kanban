use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    Router,
    extract::{Query, State},
    http::{Response, StatusCode},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::user::{GitHubUserProfile, User};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use services::services::{
    github_oauth::{GitHubOAuthConfig, GitHubOAuthService},
    local_session::LocalSessionService,
};
use tokio::sync::RwLock;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Response types for local auth endpoints
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LocalAuthInitResponse {
    pub authorize_url: String,
    pub state: String,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LocalAuthStatusResponse {
    pub authenticated: bool,
    pub user: Option<User>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LocalAuthTokenResponse {
    pub access_token: String,
}

/// State for pending OAuth handoffs
#[derive(Clone)]
pub struct PendingOAuthState {
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Combined state for local auth routes
#[derive(Clone)]
pub struct LocalAuthState {
    pub deployment: DeploymentImpl,
    pub github_oauth: Option<GitHubOAuthService>,
    pub session_service: Option<LocalSessionService>,
    pub pending_states: Arc<RwLock<HashMap<String, PendingOAuthState>>>,
}

impl LocalAuthState {
    pub fn new(deployment: DeploymentImpl) -> Self {
        let github_oauth = GitHubOAuthConfig::from_env().map(GitHubOAuthService::new);
        let session_service = LocalSessionService::from_env();

        Self {
            deployment,
            github_oauth,
            session_service,
            pending_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check if local auth is configured
    pub fn is_configured(&self) -> bool {
        self.github_oauth.is_some() && self.session_service.is_some()
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let state = LocalAuthState::new(deployment.clone());

    Router::new()
        .route("/local-auth/github", get(github_auth_init))
        .route("/local-auth/github/callback", get(github_auth_callback))
        .route("/local-auth/me", get(get_current_user))
        .route("/local-auth/logout", post(logout))
        .route("/local-auth/status", get(auth_status))
        .route("/local-auth/users", get(list_users))
        .with_state(state)
}

/// Generate a random state string for OAuth CSRF protection
fn generate_state() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

/// GET /api/local-auth/github - Initiate GitHub OAuth flow
async fn github_auth_init(
    State(state): State<LocalAuthState>,
) -> Result<ResponseJson<ApiResponse<LocalAuthInitResponse>>, ApiError> {
    let github_oauth = state
        .github_oauth
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth not configured".to_string()))?;

    let oauth_state = generate_state();

    // Store state for validation
    state.pending_states.write().await.insert(
        oauth_state.clone(),
        PendingOAuthState {
            created_at: chrono::Utc::now(),
        },
    );

    let authorize_url = github_oauth.authorization_url(&oauth_state);

    Ok(ResponseJson(ApiResponse::success(LocalAuthInitResponse {
        authorize_url,
        state: oauth_state,
    })))
}

#[derive(Debug, Deserialize)]
pub struct GitHubCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// GET /api/local-auth/github/callback - Handle GitHub OAuth callback
async fn github_auth_callback(
    State(state): State<LocalAuthState>,
    Query(query): Query<GitHubCallbackQuery>,
) -> Result<Response<String>, ApiError> {
    // Check for OAuth error from GitHub
    if let Some(error) = query.error {
        let desc = query.error_description.unwrap_or_default();
        return Ok(error_html_response(
            StatusCode::BAD_REQUEST,
            format!("GitHub OAuth error: {} - {}", error, desc),
        ));
    }

    let code = query.code.ok_or_else(|| {
        ApiError::BadRequest("Missing authorization code".to_string())
    })?;

    let oauth_state = query.state.ok_or_else(|| {
        ApiError::BadRequest("Missing state parameter".to_string())
    })?;

    // Validate state
    {
        let mut pending = state.pending_states.write().await;
        if pending.remove(&oauth_state).is_none() {
            return Err(ApiError::BadRequest("Invalid or expired state".to_string()));
        }
    }

    let github_oauth = state
        .github_oauth
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth not configured".to_string()))?;

    let session_service = state
        .session_service
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("Session service not configured".to_string()))?;

    // Exchange code for access token
    let access_token = github_oauth.exchange_code(&code).await?;

    // Fetch user profile from GitHub
    let profile = github_oauth.fetch_user(&access_token).await?;

    // Upsert user in database
    let pool = state.deployment.db().pool.clone();
    let user = User::upsert_from_github(&pool, &profile).await?;

    // Create session and get JWT token
    let jwt_token = session_service.create_session(&pool, user.id).await?;

    // Return HTML that stores the token and redirects
    Ok(success_html_response(jwt_token, user))
}

/// GET /api/local-auth/me - Get current authenticated user
async fn get_current_user(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
) -> Result<ResponseJson<ApiResponse<User>>, ApiError> {
    let session_service = state
        .session_service
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("Session service not configured".to_string()))?;

    let token = extract_bearer_token(&headers)?;
    let pool = state.deployment.db().pool.clone();

    let user = session_service.validate_token(&pool, &token).await?;

    Ok(ResponseJson(ApiResponse::success(user)))
}

/// POST /api/local-auth/logout - Log out current session
async fn logout(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, ApiError> {
    let session_service = state
        .session_service
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("Session service not configured".to_string()))?;

    let token = extract_bearer_token(&headers)?;
    let pool = state.deployment.db().pool.clone();

    // Extract session ID and revoke it
    let session_id = session_service.extract_session_id(&token)?;
    session_service.revoke_session(&pool, session_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/local-auth/status - Check authentication status
async fn auth_status(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
) -> Result<ResponseJson<ApiResponse<LocalAuthStatusResponse>>, ApiError> {
    let session_service = match state.session_service.as_ref() {
        Some(s) => s,
        None => {
            return Ok(ResponseJson(ApiResponse::success(LocalAuthStatusResponse {
                authenticated: false,
                user: None,
            })));
        }
    };

    let token = match extract_bearer_token(&headers) {
        Ok(t) => t,
        Err(_) => {
            return Ok(ResponseJson(ApiResponse::success(LocalAuthStatusResponse {
                authenticated: false,
                user: None,
            })));
        }
    };

    let pool = state.deployment.db().pool.clone();

    match session_service.validate_token(&pool, &token).await {
        Ok(user) => Ok(ResponseJson(ApiResponse::success(LocalAuthStatusResponse {
            authenticated: true,
            user: Some(user),
        }))),
        Err(_) => Ok(ResponseJson(ApiResponse::success(LocalAuthStatusResponse {
            authenticated: false,
            user: None,
        }))),
    }
}

/// GET /api/local-auth/users - List all users (for assignment picker)
async fn list_users(
    State(state): State<LocalAuthState>,
    headers: axum::http::HeaderMap,
) -> Result<ResponseJson<ApiResponse<Vec<User>>>, ApiError> {
    // Require authentication
    let session_service = state
        .session_service
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("Session service not configured".to_string()))?;

    let token = extract_bearer_token(&headers)?;
    let pool = state.deployment.db().pool.clone();

    // Validate token (ensures user is authenticated)
    session_service.validate_token(&pool, &token).await?;

    // Fetch all users
    let users = User::find_all(&pool).await?;

    Ok(ResponseJson(ApiResponse::success(users)))
}

/// Extract bearer token from Authorization header
fn extract_bearer_token(headers: &axum::http::HeaderMap) -> Result<String, ApiError> {
    let auth_header = headers
        .get("Authorization")
        .ok_or(ApiError::Unauthorized)?
        .to_str()
        .map_err(|_| ApiError::Unauthorized)?;

    if !auth_header.starts_with("Bearer ") {
        return Err(ApiError::Unauthorized);
    }

    Ok(auth_header[7..].to_string())
}

/// Generate error HTML response
fn error_html_response(status: StatusCode, message: String) -> Response<String> {
    let body = format!(
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Authentication Error</title>
    <style>
        body {{ font-family: system-ui, sans-serif; margin: 3rem; color: #1f2933; }}
        .error {{ color: #c53030; }}
    </style>
</head>
<body>
    <h1 class="error">Authentication Failed</h1>
    <p>{}</p>
    <p>Please close this window and try again.</p>
</body>
</html>"#,
        message
    );

    Response::builder()
        .status(status)
        .header("content-type", "text/html; charset=utf-8")
        .body(body)
        .unwrap()
}

/// Generate success HTML response that stores token and closes window
fn success_html_response(token: String, user: User) -> Response<String> {
    let user_json = serde_json::to_string(&user).unwrap_or_default();

    let body = format!(
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Authentication Successful</title>
    <script>
        // Store the token in localStorage
        localStorage.setItem('vk_auth_token', '{}');
        localStorage.setItem('vk_user', '{}');

        // Notify opener window if exists
        if (window.opener) {{
            window.opener.postMessage({{ type: 'AUTH_SUCCESS', token: '{}' }}, '*');
        }}

        // Try to close the popup
        window.addEventListener('load', () => {{
            try {{ window.close(); }} catch (e) {{}}
            setTimeout(() => {{ window.close(); }}, 150);
        }});
    </script>
    <style>
        body {{ font-family: system-ui, sans-serif; margin: 3rem; color: #1f2933; }}
        .success {{ color: #276749; }}
    </style>
</head>
<body>
    <h1 class="success">Authentication Successful</h1>
    <p>Welcome, {}!</p>
    <p>If this window doesn't close automatically, you can close it now.</p>
</body>
</html>"#,
        token,
        user_json.replace('\\', "\\\\").replace('\'', "\\'"),
        token,
        user.display_name.unwrap_or(user.username)
    );

    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/html; charset=utf-8")
        .body(body)
        .unwrap()
}
