use std::{collections::HashMap, sync::LazyLock};

use axum::{
    Json, Router,
    extract::{Json as ExtractJson, Query},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, webrtc_runtime::StartSessionParams};

static WEBRTC_SESSIONS: LazyLock<RwLock<HashMap<Uuid, WebRtcUpgradeSession>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum WebRtcTransportStatus {
    Relay,
    Upgrading,
    Webrtc,
    Fallback,
}

#[derive(Debug, Clone)]
struct WebRtcUpgradeSession {
    status: WebRtcTransportStatus,
    reason: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct StartWebRtcUpgradeRequest {
    pub offer_sdp: String,
    pub signing_session_id: Uuid,
    pub request_nonce: String,
}

#[derive(Debug, Serialize, TS)]
pub struct StartWebRtcUpgradeResponse {
    pub session_id: Uuid,
    pub status: WebRtcTransportStatus,
    pub answer_sdp: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct FinalizeWebRtcUpgradeRequest {
    pub session_id: Uuid,
}

#[derive(Debug, Serialize, TS)]
pub struct FinalizeWebRtcUpgradeResponse {
    pub session_id: Uuid,
    pub status: WebRtcTransportStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WebRtcStatusQuery {
    pub session_id: Uuid,
}

#[derive(Debug, Serialize, TS)]
pub struct WebRtcStatusResponse {
    pub session_id: Uuid,
    pub status: WebRtcTransportStatus,
    pub reason: Option<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/relay-webrtc/start", post(start_webrtc_upgrade))
        .route("/relay-webrtc/finalize", post(finalize_webrtc_upgrade))
        .route("/relay-webrtc/status", get(get_webrtc_upgrade_status))
}

async fn start_webrtc_upgrade(
    axum::extract::State(deployment): axum::extract::State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<StartWebRtcUpgradeRequest>,
) -> Json<ApiResponse<StartWebRtcUpgradeResponse>> {
    let enabled = std::env::var("VK_WEBRTC_ENABLED")
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(true);

    if !enabled {
        let session_id = Uuid::new_v4();
        let status = WebRtcTransportStatus::Fallback;
        let reason = Some("WebRTC transport is disabled by VK_WEBRTC_ENABLED.".to_string());

        let mut sessions = WEBRTC_SESSIONS.write().await;
        sessions.insert(
            session_id,
            WebRtcUpgradeSession {
                status,
                reason: reason.clone(),
            },
        );

        return Json(ApiResponse::success(StartWebRtcUpgradeResponse {
            session_id,
            status,
            answer_sdp: None,
            reason,
        }));
    }

    match crate::webrtc_runtime::runtime()
        .create_session(
            deployment,
            StartSessionParams {
                offer_sdp: payload.offer_sdp,
                signing_session_id: payload.signing_session_id,
                request_nonce: payload.request_nonce,
            },
        )
        .await
    {
        Ok((session_id, answer_sdp, status, reason)) => {
            let mut sessions = WEBRTC_SESSIONS.write().await;
            sessions.insert(
                session_id,
                WebRtcUpgradeSession {
                    status,
                    reason: reason.clone(),
                },
            );

            Json(ApiResponse::success(StartWebRtcUpgradeResponse {
                session_id,
                status,
                answer_sdp,
                reason,
            }))
        }
        Err(error) => {
            let session_id = Uuid::new_v4();
            let status = WebRtcTransportStatus::Fallback;
            let reason = Some(format!(
                "WebRTC negotiation failed; using relay fallback: {error}"
            ));

            let mut sessions = WEBRTC_SESSIONS.write().await;
            sessions.insert(
                session_id,
                WebRtcUpgradeSession {
                    status,
                    reason: reason.clone(),
                },
            );

            Json(ApiResponse::success(StartWebRtcUpgradeResponse {
                session_id,
                status,
                answer_sdp: None,
                reason,
            }))
        }
    }
}

async fn finalize_webrtc_upgrade(
    ExtractJson(payload): ExtractJson<FinalizeWebRtcUpgradeRequest>,
) -> Json<ApiResponse<FinalizeWebRtcUpgradeResponse>> {
    let (status, reason) = crate::webrtc_runtime::runtime()
        .finalize_session(payload.session_id)
        .await;

    let mut sessions = WEBRTC_SESSIONS.write().await;
    let session = sessions
        .entry(payload.session_id)
        .or_insert(WebRtcUpgradeSession {
            status,
            reason: reason.clone(),
        });
    session.status = status;
    session.reason = reason.clone();

    Json(ApiResponse::success(FinalizeWebRtcUpgradeResponse {
        session_id: payload.session_id,
        status,
        reason,
    }))
}

async fn get_webrtc_upgrade_status(
    Query(query): Query<WebRtcStatusQuery>,
) -> Json<ApiResponse<WebRtcStatusResponse>> {
    let (status, reason) = crate::webrtc_runtime::runtime()
        .status(query.session_id)
        .await;

    Json(ApiResponse::success(WebRtcStatusResponse {
        session_id: query.session_id,
        status,
        reason,
    }))
}
