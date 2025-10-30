mod config;
mod processor;
mod publisher;
mod status;

use std::{
    io,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

use async_trait::async_trait;
use axum::http::{HeaderName, HeaderValue, header::AUTHORIZATION};
use config::ShareConfig;
use db::{
    DBService,
    models::{
        shared_task::{SharedActivityCursor, SharedTask, SharedTaskInput},
        task::{CreateTask, Task},
    },
};
use processor::ActivityProcessor;
pub use publisher::SharePublisher;
use remote::{
    ServerMessage,
    db::{identity::UserData as RemoteUserData, tasks::SharedTask as RemoteSharedTask},
};
use sqlx::SqlitePool;
use thiserror::Error;
use tokio::{sync::oneshot, task::JoinHandle, time::sleep};
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

const WS_BACKOFF_BASE_DELAY: Duration = Duration::from_secs(1);
const WS_BACKOFF_MAX_DELAY: Duration = Duration::from_secs(30);

// Maximum delay between catching up and establishing a WebSocket connection.
// When syncing, we first catch up on missed events via REST API calls, then open a WebSocket
// connection to receive live updates. If the WebSocket connection takes too long to establish,
// we restart the process from catching up again to avoid missing events.
const MAX_DELAY_BETWEEN_CATCHUP_AND_WS: Duration = Duration::from_secs(120);

struct Backoff {
    current: Duration,
}

impl Backoff {
    fn new() -> Self {
        Self {
            current: WS_BACKOFF_BASE_DELAY,
        }
    }

    fn reset(&mut self) {
        self.current = WS_BACKOFF_BASE_DELAY;
    }

    async fn wait(&mut self) {
        let wait = self.current;
        sleep(wait).await;
        let doubled = wait.checked_mul(2).unwrap_or(WS_BACKOFF_MAX_DELAY);
        self.current = std::cmp::min(doubled, WS_BACKOFF_MAX_DELAY);
    }
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
            let processor = ActivityProcessor::new(db.clone(), config.clone(), sessions.clone());
            let sync = Self {
                db,
                processor,
                config,
                sessions,
            };
            let (shutdown_tx, shutdown_rx) = oneshot::channel();
            let join = tokio::spawn(async move {
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

    pub async fn run(self, mut shutdown_rx: oneshot::Receiver<()>) -> Result<(), ShareError> {
        let mut backoff = Backoff::new();
        loop {
            let session = self.sessions.wait_for_active().await;
            let org_id = session.org_id.clone().ok_or(ShareError::MissingAuth)?;

            let mut last_seq = SharedActivityCursor::get(&self.db.pool, org_id.clone())
                .await?
                .map(|cursor| cursor.last_seq);
            last_seq = self
                .processor
                .catch_up(&session, last_seq)
                .await
                .unwrap_or(last_seq);

            let ws_url = self.config.websocket_endpoint(last_seq)?;
            let (close_tx, close_rx) = oneshot::channel();
            let ws_connection = match spawn_shared_remote(
                self.processor.clone(),
                &self.sessions,
                ws_url,
                close_tx,
            )
            .await
            {
                Ok(remote) => {
                    backoff.reset();
                    remote
                }
                Err(err) => {
                    tracing::error!(?err, "failed to start remote sync websocket; retrying soon");
                    tokio::select! {
                        _ = &mut shutdown_rx => {
                            tracing::info!("shutdown received while waiting to retry remote sync");
                            return Ok(());
                        }
                        _ = backoff.wait() => {}
                    }
                    continue;
                }
            };

            tokio::select! {
                _ = &mut shutdown_rx => {
                    tracing::info!("shutdown signal received for remote sync");
                    if let Err(err) = ws_connection.close() {
                        tracing::warn!(?err, "failed to request websocket shutdown");
                    }
                    break;
                }
                res = close_rx => {
                    match res {
                        Ok(()) => {
                            tracing::info!("remote sync websocket closed; scheduling catch-up and reconnect");
                        }
                        Err(_) => {
                            tracing::warn!("remote sync websocket close signal dropped");
                        }
                    }
                    if let Err(err) = ws_connection.close() {
                        tracing::debug!(?err, "websocket already closed when shutting down");
                    }
                    tokio::select! {
                        _ = &mut shutdown_rx => {
                            tracing::info!("shutdown received during websocket retry backoff");
                            return Ok(());
                        }
                        _ = backoff.wait() => {}
                    }
                    continue;
                }
            }
        }
        Ok(())
    }
}

struct SharedWsHandler {
    processor: ActivityProcessor,
    close_tx: Option<oneshot::Sender<()>>,
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
                    // Remote sends this error when client has lagged too far behind.
                    // Return Err will trigger the `on_close` handler.
                    return Err(WsError::Handler(Box::new(io::Error::other(format!(
                        "remote websocket error: {message}"
                    )))));
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
        if let Some(tx) = self.close_tx.take() {
            let _ = tx.send(());
        }
        Ok(())
    }
}

async fn spawn_shared_remote(
    processor: ActivityProcessor,
    sessions: &ClerkSessionStore,
    url: Url,
    close_tx: oneshot::Sender<()>,
) -> Result<WsClient, ShareError> {
    let session_source = sessions.clone();
    let ws_config = WsConfig {
        url,
        ping_interval: Some(std::time::Duration::from_secs(30)),
        header_factory: Some(Arc::new(move || {
            let session_source = session_source.clone();
            Box::pin(async move {
                match tokio::time::timeout(
                    MAX_DELAY_BETWEEN_CATCHUP_AND_WS,
                    session_source.wait_for_active(),
                )
                .await
                {
                    Ok(session) => build_ws_headers(&session),
                    Err(_) => Err(WsError::MissingAuth),
                }
            })
        })),
    };

    let handler = SharedWsHandler {
        processor,
        close_tx: Some(close_tx),
    };
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
    user: Option<&RemoteUserData>,
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
        assignee_first_name: user.and_then(|u| u.first_name.clone()),
        assignee_last_name: user.and_then(|u| u.last_name.clone()),
        assignee_username: user.and_then(|u| u.username.clone()),
        version: task.version,
        last_event_seq,
        created_at: task.created_at,
        updated_at: task.updated_at,
    }
}

pub(super) async fn sync_local_task_for_shared_task(
    pool: &SqlitePool,
    shared_task: &SharedTask,
    current_user_id: Option<&str>,
    creator_user_id: Option<&str>,
) -> Result<(), ShareError> {
    if let Some(task) = Task::find_by_shared_task_id(pool, shared_task.id).await? {
        debug_assert_eq!(task.shared_task_id, Some(shared_task.id));

        let needs_update = task.project_id != shared_task.project_id
            || task.title != shared_task.title
            || task.description != shared_task.description
            || task.status != shared_task.status;

        if needs_update {
            Task::update(
                pool,
                task.id,
                shared_task.project_id,
                shared_task.title.clone(),
                shared_task.description.clone(),
                shared_task.status.clone(),
                task.parent_task_attempt,
            )
            .await?;
        }

        return Ok(());
    }

    let assignee_is_current_user = match (shared_task.assignee_user_id.as_deref(), current_user_id)
    {
        (Some(assignee), Some(current)) => assignee == current,
        _ => false,
    };

    if !assignee_is_current_user {
        return Ok(());
    }

    let creator_is_current_user = match (creator_user_id, current_user_id) {
        (Some(creator), Some(current)) => creator == current,
        _ => false,
    };

    if creator_is_current_user {
        // Current user created the shared task but has no corresponding local shared-task record.
        // This can happen if a share acivity event is received before the task sharing operation completes.
        return Ok(());
    }

    // Current user owns the shared task but has no local record; create and link one.
    let create = CreateTask::from_shared_task(
        shared_task.project_id,
        shared_task.title.clone(),
        shared_task.description.clone(),
        shared_task.status.clone(),
        shared_task.id,
    );
    let task_id = Uuid::new_v4();
    Task::create(pool, &create, task_id).await?;

    Ok(())
}
