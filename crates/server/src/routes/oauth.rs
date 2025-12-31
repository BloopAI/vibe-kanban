use axum::{
    Router,
    extract::{Json, Query, State},
    http::{HeaderMap, Response, StatusCode, header::SET_COOKIE},
    response::Json as ResponseJson,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use deployment::Deployment;
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use services::services::{
    config::save_config_to_file,
    google_sso::{GoogleSsoError, SESSION_COOKIE_NAME},
    oauth_credentials::Credentials,
};
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

// ============================================================================
// Google SSO Types
// ============================================================================

/// Request body for POST /api/auth/google/verify
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct GoogleVerifyRequest {
    pub id_token: String,
}

/// Response from POST /api/auth/google/verify
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct GoogleVerifyResponse {
    pub email: String,
}

/// Response from GET /api/auth/google/session
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct GoogleSessionResponse {
    pub authenticated: bool,
    pub email: Option<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        // Existing OAuth handoff routes (for remote/share functionality)
        .route("/auth/handoff/init", post(handoff_init))
        .route("/auth/handoff/complete", get(handoff_complete))
        .route("/auth/logout", post(logout))
        .route("/auth/status", get(status))
        .route("/auth/token", get(get_token))
        .route("/auth/user", get(get_current_user))
        // Google SSO routes
        .route("/auth/google/verify", post(google_verify))
        .route("/auth/google/session", get(google_session))
        .route("/auth/google/logout", post(google_logout))
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
    let remote_client = deployment.remote_client()?;

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
    let remote_client = deployment.remote_client()?;

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
// Google SSO Handlers
// ============================================================================

/// Verify a Google ID token and create a session
async fn google_verify(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<GoogleVerifyRequest>,
) -> Result<(StatusCode, [(axum::http::HeaderName, String); 1], ResponseJson<ApiResponse<GoogleVerifyResponse>>), ApiError> {
    let google_sso = deployment.google_sso_service();

    let (session_id, email) = google_sso
        .verify_token(&payload.id_token)
        .await
        .map_err(|e| match e {
            GoogleSsoError::NotEnabled => ApiError::BadRequest("Google SSO is not enabled".to_string()),
            GoogleSsoError::MissingClientId => ApiError::BadRequest("Google SSO is not configured".to_string()),
            GoogleSsoError::TokenValidation(msg) => ApiError::Unauthorized,
            GoogleSsoError::DomainNotAllowed(domain) => {
                ApiError::Forbidden(format!("Email domain '{}' is not allowed", domain))
            }
            GoogleSsoError::InvalidSession => ApiError::Unauthorized,
            GoogleSsoError::HttpError(e) => {
                tracing::error!("Google token validation HTTP error: {}", e);
                ApiError::BadRequest("Failed to validate token with Google".to_string())
            }
        })?;

    // Set session cookie (HttpOnly, SameSite=Lax for security)
    let cookie = format!(
        "{}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        SESSION_COOKIE_NAME,
        session_id,
        24 * 60 * 60 // 24 hours in seconds
    );

    Ok((
        StatusCode::OK,
        [(SET_COOKIE, cookie)],
        ResponseJson(ApiResponse::success(GoogleVerifyResponse { email })),
    ))
}

/// Check the current Google SSO session status
async fn google_session(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> ResponseJson<ApiResponse<GoogleSessionResponse>> {
    let google_sso = deployment.google_sso_service();

    // If SSO is not enabled, return not authenticated
    if !google_sso.is_enabled() {
        return ResponseJson(ApiResponse::success(GoogleSessionResponse {
            authenticated: false,
            email: None,
        }));
    }

    // Extract session cookie
    let session_id = extract_session_cookie(&headers);

    let (authenticated, email) = match session_id {
        Some(id) => match google_sso.validate_session(&id) {
            Some(email) => (true, Some(email)),
            None => (false, None),
        },
        None => (false, None),
    };

    ResponseJson(ApiResponse::success(GoogleSessionResponse {
        authenticated,
        email,
    }))
}

/// Logout from Google SSO (clear session)
async fn google_logout(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> (StatusCode, [(axum::http::HeaderName, String); 1]) {
    let google_sso = deployment.google_sso_service();

    // Extract and remove session if exists
    if let Some(session_id) = extract_session_cookie(&headers) {
        google_sso.remove_session(&session_id);
    }

    // Clear the cookie by setting it to expire immediately
    let cookie = format!(
        "{}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        SESSION_COOKIE_NAME
    );

    (StatusCode::NO_CONTENT, [(SET_COOKIE, cookie)])
}

/// Extract the session cookie from headers
pub fn extract_session_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|cookie| {
            let cookie = cookie.trim();
            if cookie.starts_with(SESSION_COOKIE_NAME) {
                cookie
                    .strip_prefix(SESSION_COOKIE_NAME)
                    .and_then(|s| s.strip_prefix('='))
                    .map(|s| s.to_string())
            } else {
                None
            }
        })
}
