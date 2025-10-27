mod config;
mod processor;
mod publisher;
mod status;

use std::sync::{Arc, Mutex as StdMutex};

use async_trait::async_trait;
use axum::http::{HeaderName, HeaderValue, header::AUTHORIZATION};
use config::ShareConfig;
use db::{
    DBService,
    models::shared_task::{SharedActivityCursor, SharedTaskInput},
};
use processor::ActivityProcessor;
pub use publisher::SharePublisher;
use remote::{ServerMessage, db::tasks::SharedTask as RemoteSharedTask};
use thiserror::Error;
use tokio::{sync::oneshot, task::JoinHandle};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use url::Url;
use utils::ws::{WsClient, WsConfig, WsError, WsHandler, WsResult, run_ws_client};
use uuid::Uuid;

use crate::services::{
    clerk::{ClerkSession, ClerkSessionStore},
    git::GitServiceError,
    github_service::GitHubServiceError,
};

#[derive(Debug, Error)]
pub enum ShareError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Transport(#[from] reqwest::Error),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
    #[error(transparent)]
    Url(#[from] url::ParseError),
    #[error(transparent)]
    WebSocket(#[from] WsError),
    #[error("share configuration missing: {0}")]
    MissingConfig(&'static str),
    #[error("task {0} not found")]
    TaskNotFound(Uuid),
    #[error("project {0} not found")]
    ProjectNotFound(Uuid),
    #[error("project {0} is missing GitHub metadata for sharing")]
    MissingProjectMetadata(Uuid),
    #[error("invalid response from remote share service")]
    InvalidResponse,
    #[error("task {0} is already shared")]
    AlreadyShared(Uuid),
    #[error("GitHub token is required to fetch repository ID")]
    MissingGitHubToken,
    #[error(transparent)]
    Git(#[from] GitServiceError),
    #[error(transparent)]
    GitHub(#[from] GitHubServiceError),
    #[error("share authentication missing or expired")]
    MissingAuth,
}

pub struct RemoteSync {
    db: DBService,
    processor: ActivityProcessor,
    config: ShareConfig,
    sessions: ClerkSessionStore,
}

impl RemoteSync {
    pub fn spawn_if_configured(
        db: DBService,
        sessions: ClerkSessionStore,
    ) -> Option<RemoteSyncHandle> {
        if let Some(config) = ShareConfig::from_env() {
            tracing::info!(api = %config.api_base, "starting shared task synchronizer");
            let processor = ActivityProcessor::new(db.clone(), config.clone());
            dbg!("spawning remote sync task");
            let sync = Self {
                db,
                processor,
                config,
                sessions,
            };
            dbg!("remote sync task initialized");
            let (shutdown_tx, shutdown_rx) = oneshot::channel();
            let join = tokio::spawn(async move {
                dbg!("remote sync task running");
                if let Err(e) = sync.run(shutdown_rx).await {
                    tracing::error!(?e, "remote sync terminated unexpectedly");
                }
            });

            Some(RemoteSyncHandle::new(shutdown_tx, join))
        } else {
            tracing::warn!("remote sync not configured; skipping");
            None
        }
    }

    pub async fn run(self, shutdown_rx: oneshot::Receiver<()>) -> Result<(), ShareError> {
        dbg!("starting remote sync task");
        let session = self.sessions.wait_for_active().await;
        dbg!("obtained active clerk session");
        let org_id = session.org_id.clone().ok_or(ShareError::MissingAuth)?;
        dbg!("organization id:", &org_id);

        let mut last_seq = SharedActivityCursor::get(&self.db.pool, org_id.clone())
            .await?
            .map(|cursor| cursor.last_seq);
        last_seq = self
            .processor
            .catch_up(&session, last_seq)
            .await
            .unwrap_or(last_seq);

        dbg!(&last_seq);

        let ws_url = self.config.websocket_endpoint(last_seq)?;
        let remote = spawn_shared_remote(self.processor.clone(), &self.sessions, ws_url).await?;

        let _ = shutdown_rx.await;
        tracing::info!("shutdown signal received for remote sync");

        if let Err(err) = remote.shutdown() {
            tracing::warn!(?err, "failed to request websocket shutdown");
        }
        Ok(())
    }
}

struct SharedWsHandler {
    processor: ActivityProcessor,
}

#[async_trait]
impl WsHandler for SharedWsHandler {
    async fn handle_message(&mut self, msg: WsMessage) -> Result<(), WsError> {
        if let WsMessage::Text(txt) = msg {
            match serde_json::from_str::<ServerMessage>(&txt) {
                Ok(ServerMessage::Activity(event)) => {
                    let seq = event.seq;
                    self.processor
                        .process_event(event)
                        .await
                        .map_err(|err| WsError::Handler(Box::new(err)))?;

                    tracing::debug!(seq, "processed remote activity");
                }
                Ok(ServerMessage::Error { message }) => {
                    tracing::warn!(?message, "received WS error message");
                }
                Err(err) => {
                    tracing::error!(raw = %txt, ?err, "unable to parse WS message");
                }
            }
        }
        Ok(())
    }

    async fn on_close(&mut self) -> Result<(), WsError> {
        tracing::info!("WebSocket closed, handler cleanup if needed");
        Ok(())
    }
}

async fn spawn_shared_remote(
    processor: ActivityProcessor,
    sessions: &ClerkSessionStore,
    url: Url,
) -> Result<WsClient, ShareError> {
    let session_source = sessions.clone();
    let ws_config = WsConfig {
        url,
        autoreconnect: true,
        reconnect_base_delay: std::time::Duration::from_secs(1),
        reconnect_max_delay: std::time::Duration::from_secs(30),
        ping_interval: Some(std::time::Duration::from_secs(30)),
        header_factory: Some(Arc::new(move || {
            let session_source = session_source.clone();
            Box::pin(async move {
                let session = session_source.wait_for_active().await;
                build_ws_headers(&session)
            })
        })),
    };

    let handler = SharedWsHandler { processor };
    run_ws_client(handler, ws_config)
        .await
        .map_err(ShareError::from)
}

fn build_ws_headers(session: &ClerkSession) -> WsResult<Vec<(HeaderName, HeaderValue)>> {
    let mut headers = Vec::new();
    let value = format!("Bearer {}", session.bearer());
    let header = HeaderValue::from_str(&value).map_err(|err| WsError::Header(err.to_string()))?;
    headers.push((AUTHORIZATION, header));
    Ok(headers)
}

#[derive(Clone)]
pub struct RemoteSyncHandle {
    inner: Arc<RemoteSyncHandleInner>,
}

struct RemoteSyncHandleInner {
    shutdown: StdMutex<Option<oneshot::Sender<()>>>,
    join: StdMutex<Option<JoinHandle<()>>>,
}

impl RemoteSyncHandle {
    fn new(shutdown: oneshot::Sender<()>, join: JoinHandle<()>) -> Self {
        Self {
            inner: Arc::new(RemoteSyncHandleInner {
                shutdown: StdMutex::new(Some(shutdown)),
                join: StdMutex::new(Some(join)),
            }),
        }
    }

    pub fn request_shutdown(&self) {
        if let Some(tx) = self.inner.shutdown.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    pub async fn shutdown(&self) {
        self.request_shutdown();
        let join = {
            let mut guard = self.inner.join.lock().unwrap();
            guard.take()
        };

        if let Some(join) = join
            && let Err(err) = join.await
        {
            tracing::warn!(?err, "remote sync task join failed");
        }
    }
}

impl Drop for RemoteSyncHandleInner {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown.lock().unwrap().take() {
            let _ = tx.send(());
        }
        if let Some(join) = self.join.lock().unwrap().take() {
            join.abort();
        }
    }
}

pub(super) fn convert_remote_task(
    task: &RemoteSharedTask,
    project_id: Uuid,
    last_event_seq: Option<i64>,
) -> SharedTaskInput {
    SharedTaskInput {
        id: task.id,
        organization_id: task.organization_id.clone(),
        project_id,
        title: task.title.clone(),
        description: task.description.clone(),
        status: status::from_remote(&task.status),
        assignee_user_id: task.assignee_user_id.clone(),
        version: task.version,
        last_event_seq,
        created_at: task.created_at,
        updated_at: task.updated_at,
    }
}
