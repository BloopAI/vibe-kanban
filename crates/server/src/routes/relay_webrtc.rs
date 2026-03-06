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

use crate::DeploymentImpl;

static WEBRTC_SESSIONS: LazyLock<RwLock<HashMap<Uuid, WebRtcUpgradeSession>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
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
    ExtractJson(_payload): ExtractJson<StartWebRtcUpgradeRequest>,
) -> Json<ApiResponse<StartWebRtcUpgradeResponse>> {
    let session_id = Uuid::new_v4();

    let enabled = std::env::var("VK_WEBRTC_ENABLED")
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(true);

    let (status, reason) =
        if enabled {
            (
            WebRtcTransportStatus::Fallback,
            Some("WebRTC transport upgrade is unavailable on this host build; using relay fallback."
                .to_string()),
        )
        } else {
            (
                WebRtcTransportStatus::Fallback,
                Some("WebRTC transport is disabled by VK_WEBRTC_ENABLED.".to_string()),
            )
        };

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

async fn finalize_webrtc_upgrade(
    ExtractJson(payload): ExtractJson<FinalizeWebRtcUpgradeRequest>,
) -> Json<ApiResponse<FinalizeWebRtcUpgradeResponse>> {
    let mut sessions = WEBRTC_SESSIONS.write().await;
    let session = sessions
        .entry(payload.session_id)
        .or_insert(WebRtcUpgradeSession {
            status: WebRtcTransportStatus::Fallback,
            reason: Some("Unknown WebRTC session; using relay fallback.".to_string()),
        });

    Json(ApiResponse::success(FinalizeWebRtcUpgradeResponse {
        session_id: payload.session_id,
        status: session.status,
        reason: session.reason.clone(),
    }))
}

async fn get_webrtc_upgrade_status(
    Query(query): Query<WebRtcStatusQuery>,
) -> Json<ApiResponse<WebRtcStatusResponse>> {
    let sessions = WEBRTC_SESSIONS.read().await;

    if let Some(session) = sessions.get(&query.session_id) {
        return Json(ApiResponse::success(WebRtcStatusResponse {
            session_id: query.session_id,
            status: session.status,
            reason: session.reason.clone(),
        }));
    }

    Json(ApiResponse::success(WebRtcStatusResponse {
        session_id: query.session_id,
        status: WebRtcTransportStatus::Fallback,
        reason: Some("Unknown WebRTC session; using relay fallback.".to_string()),
    }))
}
