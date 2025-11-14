use axum::{
    Router,
    extract::{Json, Query, State},
    http::{Response, StatusCode},
    response::Json as ResponseJson,
    routing::{get, post},
};
use deployment::Deployment;
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use services::services::{config::save_config_to_file, oauth_credentials::Credentials};
use sha2::{Digest, Sha256};
use utils::{
    api::oauth::{HandoffInitRequest, HandoffRedeemRequest, StatusResponse},
    assets::config_path,
    response::ApiResponse,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/handoff/init", post(handoff_init))
        .route("/auth/handoff/complete", get(handoff_complete))
        .route("/auth/logout", post(logout))
        .route("/auth/status", get(status))
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

    let credentials = Credentials {
        access_token: redeem.access_token.clone(),
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

    // Start remote sync if not already running
    {
        let handle_guard = deployment.share_sync_handle().lock().await;
        let should_start = handle_guard.is_none();
        drop(handle_guard);

        if should_start {
            if let Some(share_config) = deployment.share_config() {
                tracing::info!("Starting remote sync after login");
                deployment.spawn_remote_sync(share_config.clone());
            } else {
                tracing::debug!(
                    "Share config not available; skipping remote sync spawn after login"
                );
            }
        }
    }

    Ok(close_window_response(format!(
        "Signed in with {provider}. You can return to the app."
    )))
}

async fn logout(State(deployment): State<DeploymentImpl>) -> Result<StatusCode, ApiError> {
    // Stop remote sync if running
    if let Some(handle) = deployment.share_sync_handle().lock().await.take() {
        tracing::info!("Stopping remote sync due to logout");
        handle.shutdown().await;
    }

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
