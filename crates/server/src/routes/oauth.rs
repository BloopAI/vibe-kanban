use api_types::{HandoffInitRequest, HandoffRedeemRequest, StatusResponse};
use axum::{
    Router,
    extract::{Json, Query, State},
    http::{Response, StatusCode},
    response::Json as ResponseJson,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use deployment::Deployment;
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use services::services::{
    config::save_config_to_file, oauth_credentials::Credentials, remote_sync,
};
use sha2::{Digest, Sha256};
use ts_rs::TS;
use utils::{assets::config_path, jwt::extract_expiration, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, tunnel};

/// Base64-encoded 32x32 app icon (from `crates/tauri-app/icons/32x32.png`).
const APP_ICON_BASE64: &str = "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";

/// Shared CSS styles for standalone OAuth HTML pages (success & error).
/// Colors and typography match the app's design system (light mode defaults
/// from `packages/web-core/src/app/styles/new/index.css`).
const AUTH_PAGE_STYLES: &str = r#"<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f2f2f2;
    color: #333;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 24px;
  }
  .logo { width: 40px; height: 40px; }
  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .title {
    font-size: 13px;
    font-weight: 500;
    color: #0d0d0d;
  }
  .subtitle {
    font-size: 12px;
    color: #636363;
  }
</style>"#;

/// Response from GET /api/auth/token - returns the current access token
#[derive(Debug, Serialize, TS)]
pub struct TokenResponse {
    pub access_token: String,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Response from GET /api/auth/user - returns the current user ID
#[derive(Debug, Serialize, TS)]
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
    /// When set to "desktop", the callback page will not auto-close so the user
    /// can see the success message (e.g. when opened from the Tauri desktop app).
    #[serde(default)]
    source: Option<String>,
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

    // Sync all linked workspace states and PRs to remote in the background
    if let Ok(client) = deployment.remote_client() {
        let pool = deployment.db().pool.clone();
        let git = deployment.git().clone();
        tokio::spawn(async move {
            remote_sync::sync_all_linked_workspaces(&client, &pool, &git).await;
        });
    }

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

        // Merge the local machine-based ID with the remote user UUID so all
        // events (local frontend, local backend, remote backend) resolve to
        // the same PostHog person. Uses $merge_dangerously because
        // $create_alias is blocked by PostHog's safeguard when the machine
        // ID was already used as a distinct_id in a prior identify call.
        analytics.track_event(
            &profile.user_id.to_string(),
            "$merge_dangerously",
            Some(serde_json::json!({
                "alias": deployment.user_id(),
            })),
        );
    }

    // Start relay if enabled
    let relay_deployment = deployment.clone();
    tokio::spawn(async move {
        tunnel::spawn_relay(&relay_deployment).await;
    });

    let is_desktop = query.source.as_deref() == Some("desktop");
    Ok(close_window_response(
        format!("Signed in with {provider}. You can return to the app."),
        is_desktop,
    ))
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

    tunnel::stop_relay(&deployment).await;

    Ok(StatusCode::NO_CONTENT)
}

async fn status(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<StatusResponse>>, ApiError> {
    use api_types::LoginStatus;

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
        r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OAuth Error</title>
    {AUTH_PAGE_STYLES}
  </head>
  <body>
    <div class="container">
      <img class="logo" src="data:image/png;base64,{APP_ICON_BASE64}" alt="Vibe Kanban">
      <div class="content">
        <p class="title">{message}</p>
        <p class="subtitle">Please close this tab and try again.</p>
      </div>
    </div>
  </body>
</html>"#
    );
    Response::builder()
        .status(status)
        .header("content-type", "text/html; charset=utf-8")
        .body(body)
        .unwrap()
}

fn close_window_response(message: String, skip_auto_close: bool) -> Response<String> {
    let script = if skip_auto_close {
        "" // Desktop app: leave the tab open so the user sees the message
    } else {
        "<script>\
           window.addEventListener('load', () => {\
             try { window.close(); } catch (err) {}\
             setTimeout(() => { window.close(); }, 150);\
           });\
         </script>"
    };
    let body = format!(
        r#"<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authentication Complete</title>
    {script}
    {AUTH_PAGE_STYLES}
  </head>
  <body>
    <div class="container">
      <img class="logo" src="data:image/png;base64,{APP_ICON_BASE64}" alt="Vibe Kanban">
      <div class="content">
        <p class="title">{message}</p>
        <p class="subtitle">You can close this tab and return to the app.</p>
      </div>
    </div>
  </body>
</html>"#
    );

    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/html; charset=utf-8")
        .body(body)
        .unwrap()
}
