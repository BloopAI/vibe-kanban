use axum::{
    Router,
    extract::{Json, Query, State},
    http::{Response, StatusCode},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::github_connection::{CreateGitHubConnection, GitHubConnection, UpdateGitHubConnection};
use chrono::{DateTime, Utc};
use deployment::Deployment;
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use services::services::{config::save_config_to_file, oauth_credentials::Credentials};
use sha2::{Digest, Sha256};
use tokio;
use ts_rs::TS;
use utils::{
    api::oauth::{HandoffInitRequest, HandoffRedeemRequest, StatusResponse},
    assets::config_path,
    jwt::extract_expiration,
    response::ApiResponse,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Response from GET /api/auth/token - returns the current access token
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct TokenResponse {
    pub access_token: String,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Response from GET /api/auth/user - returns the current user ID
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct CurrentUserResponse {
    pub user_id: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/handoff/init", post(handoff_init))
        .route("/auth/handoff/complete", get(handoff_complete))
        .route("/auth/logout", post(logout))
        .route("/auth/status", get(status))
        .route("/auth/token", get(get_token))
        .route("/auth/user", get(get_current_user))
        // GitHub OAuth for team connections
        .route("/oauth/github/authorize", get(github_authorize))
        .route("/oauth/github/callback", get(github_callback))
}

#[derive(Debug, Deserialize)]
struct HandoffInitPayload {
    provider: String,
    return_to: String,
}

#[derive(Debug, Serialize)]
struct HandoffInitResponseBody {
    handoff_id: Uuid,
    authorize_url: String,
}

async fn handoff_init(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<HandoffInitPayload>,
) -> Result<ResponseJson<ApiResponse<HandoffInitResponseBody>>, ApiError> {
    let client = deployment.remote_client()?;

    let app_verifier = generate_secret();
    let app_challenge = hash_sha256_hex(&app_verifier);

    let request = HandoffInitRequest {
        provider: payload.provider.clone(),
        return_to: payload.return_to.clone(),
        app_challenge,
    };

    let response = client.handoff_init(&request).await?;

    deployment
        .store_oauth_handoff(response.handoff_id, payload.provider, app_verifier)
        .await;

    Ok(ResponseJson(ApiResponse::success(
        HandoffInitResponseBody {
            handoff_id: response.handoff_id,
            authorize_url: response.authorize_url,
        },
    )))
}

#[derive(Debug, Deserialize)]
struct HandoffCompleteQuery {
    handoff_id: Uuid,
    #[serde(default)]
    app_code: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

async fn handoff_complete(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<HandoffCompleteQuery>,
) -> Result<Response<String>, ApiError> {
    if let Some(error) = query.error {
        return Ok(simple_html_response(
            StatusCode::BAD_REQUEST,
            format!("OAuth authorization failed: {error}"),
        ));
    }

    let Some(app_code) = query.app_code.clone() else {
        return Ok(simple_html_response(
            StatusCode::BAD_REQUEST,
            "Missing app_code in callback".to_string(),
        ));
    };

    let (provider, app_verifier) = match deployment.take_oauth_handoff(&query.handoff_id).await {
        Some(state) => state,
        None => {
            tracing::warn!(
                handoff_id = %query.handoff_id,
                "received callback for unknown handoff"
            );
            return Ok(simple_html_response(
                StatusCode::BAD_REQUEST,
                "OAuth handoff not found or already completed".to_string(),
            ));
        }
    };

    let client = deployment.remote_client()?;

    let redeem_request = HandoffRedeemRequest {
        handoff_id: query.handoff_id,
        app_code,
        app_verifier,
    };

    let redeem = client.handoff_redeem(&redeem_request).await?;

    let expires_at = extract_expiration(&redeem.access_token)
        .map_err(|err| ApiError::BadRequest(format!("Invalid access token: {err}")))?;
    let credentials = Credentials {
        access_token: Some(redeem.access_token.clone()),
        refresh_token: redeem.refresh_token.clone(),
        expires_at: Some(expires_at),
    };

    deployment
        .auth_context()
        .save_credentials(&credentials)
        .await
        .map_err(|e| {
            tracing::error!(?e, "failed to save credentials");
            ApiError::Io(e)
        })?;

    // Enable analytics automatically on login if not already enabled
    let config_guard = deployment.config().read().await;
    if !config_guard.analytics_enabled {
        let mut new_config = config_guard.clone();
        drop(config_guard); // Release read lock before acquiring write lock

        new_config.analytics_enabled = true;

        // Save updated config to disk
        let config_path = config_path();
        if let Err(e) = save_config_to_file(&new_config, &config_path).await {
            tracing::warn!(
                ?e,
                "failed to save config after enabling analytics on login"
            );
        } else {
            // Update in-memory config
            let mut config = deployment.config().write().await;
            *config = new_config;
            drop(config);

            tracing::info!("analytics automatically enabled after successful login");

            // Track analytics_session_start event
            if let Some(analytics) = deployment.analytics() {
                analytics.track_event(
                    deployment.user_id(),
                    "analytics_session_start",
                    Some(serde_json::json!({})),
                );
            }
        }
    } else {
        drop(config_guard);
    }

    // Fetch and cache the user's profile
    let _ = deployment.get_login_status().await;

    if let Some(profile) = deployment.auth_context().cached_profile().await
        && let Some(analytics) = deployment.analytics()
    {
        analytics.track_event(
            deployment.user_id(),
            "$identify",
            Some(serde_json::json!({
                "email": profile.email,
            })),
        );
    }

    // Trigger shared task cleanup in background
    if let Ok(publisher) = deployment.share_publisher() {
        tokio::spawn(async move {
            if let Err(e) = publisher.cleanup_shared_tasks().await {
                tracing::error!("Failed to cleanup shared tasks on login: {}", e);
            }
        });
    }

    Ok(close_window_response(format!(
        "Signed in with {provider}. You can return to the app."
    )))
}

async fn logout(State(deployment): State<DeploymentImpl>) -> Result<StatusCode, ApiError> {
    let auth_context = deployment.auth_context();

    if let Ok(client) = deployment.remote_client() {
        let _ = client.logout().await;
    }

    auth_context.clear_credentials().await.map_err(|e| {
        tracing::error!(?e, "failed to clear credentials");
        ApiError::Io(e)
    })?;

    auth_context.clear_profile().await;

    Ok(StatusCode::NO_CONTENT)
}

async fn status(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<StatusResponse>>, ApiError> {
    use utils::api::oauth::LoginStatus;

    match deployment.get_login_status().await {
        LoginStatus::LoggedOut => Ok(ResponseJson(ApiResponse::success(StatusResponse {
            logged_in: false,
            profile: None,
            degraded: None,
        }))),
        LoginStatus::LoggedIn { profile } => {
            Ok(ResponseJson(ApiResponse::success(StatusResponse {
                logged_in: true,
                profile: Some(profile),
                degraded: None,
            })))
        }
    }
}

/// Returns the current access token (auto-refreshes if needed)
async fn get_token(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TokenResponse>>, ApiError> {
    // Return Unauthorized if remote client is not configured (no credentials stored)
    let remote_client = deployment.remote_client().map_err(|_| ApiError::Unauthorized)?;

    // This will auto-refresh the token if expired
    let access_token = remote_client
        .access_token()
        .await
        .map_err(|_| ApiError::Unauthorized)?;

    let creds = deployment.auth_context().get_credentials().await;
    let expires_at = creds.and_then(|c| c.expires_at);

    Ok(ResponseJson(ApiResponse::success(TokenResponse {
        access_token,
        expires_at,
    })))
}

async fn get_current_user(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<CurrentUserResponse>>, ApiError> {
    // Return Unauthorized if remote client is not configured (no credentials stored)
    let remote_client = deployment.remote_client().map_err(|_| ApiError::Unauthorized)?;

    // Get the access token from remote client
    let access_token = remote_client
        .access_token()
        .await
        .map_err(|_| ApiError::Unauthorized)?;

    // Extract user ID from the JWT token's 'sub' claim
    let user_id = utils::jwt::extract_subject(&access_token)
        .map_err(|e| {
            tracing::error!("Failed to extract user ID from token: {}", e);
            ApiError::Unauthorized
        })?
        .to_string();

    Ok(ResponseJson(ApiResponse::success(CurrentUserResponse {
        user_id,
    })))
}

fn generate_secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect()
}

fn hash_sha256_hex(input: &str) -> String {
    let mut output = String::with_capacity(64);
    let digest = Sha256::digest(input.as_bytes());
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(output, "{:02x}", byte);
    }
    output
}

fn simple_html_response(status: StatusCode, message: String) -> Response<String> {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>OAuth</title></head>\
         <body style=\"font-family: sans-serif; margin: 3rem;\"><h1>{}</h1></body></html>",
        message
    );
    Response::builder()
        .status(status)
        .header("content-type", "text/html; charset=utf-8")
        .body(body)
        .unwrap()
}

fn close_window_response(message: String) -> Response<String> {
    let body = format!(
        "<!doctype html>\
         <html>\
           <head>\
             <meta charset=\"utf-8\">\
             <title>Authentication Complete</title>\
             <script>\
               window.addEventListener('load', () => {{\
                 try {{ window.close(); }} catch (err) {{}}\
                 setTimeout(() => {{ window.close(); }}, 150);\
               }});\
             </script>\
             <style>\
               body {{ font-family: sans-serif; margin: 3rem; color: #1f2933; }}\
             </style>\
           </head>\
           <body>\
             <h1>{}</h1>\
             <p>If this window does not close automatically, you may close it manually.</p>\
           </body>\
         </html>",
        message
    );

    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/html; charset=utf-8")
        .body(body)
        .unwrap()
}

// ============================================================================
// GitHub OAuth for Team Connections
// ============================================================================

#[derive(Debug, Deserialize)]
struct GitHubAuthorizeQuery {
    team_id: Option<Uuid>,
}

#[derive(Debug, Serialize, TS)]
pub struct GitHubAuthorizeResponse {
    pub authorize_url: String,
    pub state: String,
}

/// Initiates GitHub OAuth flow - redirects to GitHub authorization page
async fn github_authorize(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<GitHubAuthorizeQuery>,
) -> Result<Response<String>, ApiError> {
    let client_id = std::env::var("GITHUB_CLIENT_ID")
        .map_err(|_| ApiError::BadRequest("GITHUB_CLIENT_ID not configured".to_string()))?;

    let redirect_uri = std::env::var("GITHUB_REDIRECT_URI").unwrap_or_else(|_| {
        let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
        format!("http://localhost:{}/api/oauth/github/callback", port)
    });

    // Generate state with optional team_id encoded
    let team_id_str = query.team_id.map(|id| id.to_string()).unwrap_or_else(|| "workspace".to_string());
    let state = format!("{}:{}", team_id_str, generate_secret());

    // Store the state for verification
    deployment
        .store_github_oauth_state(state.clone(), query.team_id)
        .await;

    let authorize_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode("repo read:user"),
        urlencoding::encode(&state)
    );

    // Redirect to GitHub authorization page
    Ok(Response::builder()
        .status(StatusCode::FOUND)
        .header("Location", authorize_url)
        .body(String::new())
        .unwrap())
}

#[derive(Debug, Deserialize)]
struct GitHubCallbackQuery {
    code: String,
    state: String,
}

#[derive(Debug, Deserialize)]
struct GitHubTokenResponse {
    access_token: String,
    token_type: String,
    scope: String,
}

#[derive(Debug, Deserialize)]
struct GitHubUserResponse {
    login: String,
}

/// Handles GitHub OAuth callback - exchanges code for token
async fn github_callback(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<GitHubCallbackQuery>,
) -> Result<Response<String>, ApiError> {
    // Verify state and get optional team_id (None = workspace-level connection)
    let team_id: Option<Uuid> = match deployment.take_github_oauth_state(&query.state).await {
        Some(id) => id,
        None => {
            return Ok(simple_html_response(
                StatusCode::BAD_REQUEST,
                "Invalid or expired OAuth state".to_string(),
            ));
        }
    };

    let client_id = std::env::var("GITHUB_CLIENT_ID")
        .map_err(|_| ApiError::BadRequest("GITHUB_CLIENT_ID not configured".to_string()))?;
    let client_secret = std::env::var("GITHUB_CLIENT_SECRET")
        .map_err(|_| ApiError::BadRequest("GITHUB_CLIENT_SECRET not configured".to_string()))?;

    // Exchange code for access token
    let client = reqwest::Client::new();
    let token_response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", &query.code),
        ])
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to exchange code: {}", e)))?;

    if !token_response.status().is_success() {
        return Ok(simple_html_response(
            StatusCode::BAD_REQUEST,
            "Failed to exchange authorization code".to_string(),
        ));
    }

    let token_data: GitHubTokenResponse = token_response
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Invalid token response: {}", e)))?;

    // Fetch GitHub username
    let user_response = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token_data.access_token))
        .header("User-Agent", "vibe-kanban")
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to fetch user: {}", e)))?;

    let github_username = if user_response.status().is_success() {
        user_response
            .json::<GitHubUserResponse>()
            .await
            .ok()
            .map(|u| u.login)
    } else {
        None
    };

    // Store or update the connection based on whether it's workspace or team level
    let existing = if let Some(tid) = team_id {
        GitHubConnection::find_by_team_id(&deployment.db().pool, tid).await?
    } else {
        GitHubConnection::find_workspace_connection(&deployment.db().pool).await?
    };

    if let Some(conn) = existing {
        // Update existing connection
        let update = UpdateGitHubConnection {
            access_token: Some(token_data.access_token),
            github_username,
        };
        GitHubConnection::update(&deployment.db().pool, conn.id, &update).await?;
    } else {
        // Create new connection
        let create = CreateGitHubConnection {
            access_token: token_data.access_token,
        };
        let conn = if let Some(tid) = team_id {
            GitHubConnection::create(&deployment.db().pool, tid, &create).await?
        } else {
            GitHubConnection::create_workspace_connection(&deployment.db().pool, &create).await?
        };

        // Update with username if available
        if github_username.is_some() {
            let update = UpdateGitHubConnection {
                access_token: None,
                github_username,
            };
            GitHubConnection::update(&deployment.db().pool, conn.id, &update).await?;
        }
    }

    Ok(close_window_response(
        "GitHub connected successfully! You can close this window.".to_string(),
    ))
}
