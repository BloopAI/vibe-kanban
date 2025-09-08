use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use axum::{
    Json, Router, body::Bytes, extract::State, http::StatusCode, response::IntoResponse,
    routing::post,
};
use serde::{Deserialize, Serialize};
use tokio::{
    net::TcpListener,
    sync::{Mutex, RwLock, broadcast},
    task::JoinHandle,
};

/// Minimal subset of OpenCode share API that we need to ingest structured events locally.
///
/// We run a lightweight HTTP server on 127.0.0.1 with an ephemeral port and point
/// OpenCode to it by setting OPENCODE_API and enabling auto-share. The CLI then POSTs
/// tool/message updates to /share_sync which we rebroadcast to interested consumers.

#[derive(Debug)]
pub struct Bridge {
    pub base_url: String,
    tx: broadcast::Sender<ShareEvent>,
    #[allow(dead_code)]
    secrets: Arc<RwLock<HashMap<String, String>>>,
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    _server_task: JoinHandle<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareCreateReq {
    #[serde(rename = "sessionID")]
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareCreateResp {
    pub url: String,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareSyncReq {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub secret: String,
    pub key: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmptyResp {}

#[derive(Debug, Clone)]
pub enum ShareEvent {
    Sync(ShareSyncReq),
}

#[derive(Clone)]
struct AppState {
    base_url: String,
    tx: broadcast::Sender<ShareEvent>,
    secrets: Arc<RwLock<HashMap<String, String>>>,
}

impl Bridge {
    /// Start a new, isolated bridge server bound to localhost on an ephemeral port.
    pub async fn start() -> std::io::Result<Arc<Bridge>> {
        let (tx, _rx) = broadcast::channel(10_000);
        let secrets = Arc::new(RwLock::new(HashMap::new()));

        // Bind to localhost:0 to get an ephemeral port
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        let addr: SocketAddr = listener.local_addr()?;
        let base_url = format!("http://{}:{}", addr.ip(), addr.port());
        tracing::debug!(
            "OpenCode share bridge started: base_url={}, port={}",
            base_url,
            addr.port()
        );

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let shutdown_tx = Arc::new(Mutex::new(Some(shutdown_tx)));

        let app_state = AppState {
            base_url: base_url.clone(),
            tx: tx.clone(),
            secrets: secrets.clone(),
        };

        let server_task = tokio::spawn(async move {
            let app = Router::new()
                .route("/share_create", post(share_create))
                .route("/share_delete", post(share_delete))
                .route("/share_sync", post(share_sync))
                .with_state(app_state);

            // Serve with graceful shutdown
            if let Err(e) = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    // wait for shutdown signal
                    let _ = shutdown_rx.await;
                })
                .await
            {
                tracing::error!("opencode share bridge server error: {}", e);
            }
        });

        Ok(Arc::new(Bridge {
            base_url,
            tx,
            secrets,
            shutdown_tx,
            _server_task: server_task,
        }))
    }

    /// Subscribe to events from this bridge instance.
    pub fn subscribe(&self) -> broadcast::Receiver<ShareEvent> {
        self.tx.subscribe()
    }

    /// Trigger graceful shutdown of this bridge server.
    pub async fn shutdown(&self) {
        tracing::debug!("Shutting down OpenCode share bridge: {}", self.base_url);
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(());
        }
    }
}

async fn share_create(State(state): State<AppState>, body: Bytes) -> impl IntoResponse {
    // accept JSON regardless of content-type
    let payload: ShareCreateReq = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => ShareCreateReq {
            session_id: "".into(),
        },
    };
    // Generate a simple secret and store against session id
    let secret = uuid::Uuid::new_v4().to_string();
    {
        let mut map = state.secrets.write().await;
        map.insert(payload.session_id.clone(), secret.clone());
    }
    (
        StatusCode::OK,
        Json(ShareCreateResp {
            secret,
            url: format!("{}/s/{}", state.base_url, short(&payload.session_id)),
        }),
    )
}

async fn share_delete(_state: State<AppState>, _body: Bytes) -> impl IntoResponse {
    (StatusCode::OK, Json(EmptyResp {}))
}

async fn share_sync(State(state): State<AppState>, body: Bytes) -> impl IntoResponse {
    let payload: ShareSyncReq = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, Json(EmptyResp {}));
        }
    };
    // Validate secret (best-effort)
    let ok = {
        let map = state.secrets.read().await;
        map.get(&payload.session_id)
            .map(|expected| expected == &payload.secret)
            .unwrap_or(false)
    };

    if !ok {
        // Still emit for debugging but warn
        tracing::debug!(
            "share_sync with invalid secret for session {}",
            payload.session_id
        );
    }

    // Broadcast event
    let _ = state.tx.send(ShareEvent::Sync(payload));
    (StatusCode::OK, Json(EmptyResp {}))
}

fn short(id: &str) -> String {
    id.chars()
        .rev()
        .take(8)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}
