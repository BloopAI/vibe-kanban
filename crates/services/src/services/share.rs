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
pub use config::ShareConfig;
use db::{
    DBService,
    models::{
        shared_task::{SharedActivityCursor, SharedTask, SharedTaskInput},
        task::{SyncTask, Task},
    },
};
use processor::ActivityProcessor;
pub use publisher::SharePublisher;
use remote::{
    ServerMessage,
    db::{tasks::SharedTask as RemoteSharedTask, users::UserData as RemoteUserData},
};
use sqlx::SqlitePool;
use thiserror::Error;
use tokio::{sync::oneshot, task::JoinHandle, time::sleep};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use url::Url;
use utils::ws::{
    WS_MAX_DELAY_BETWEEN_CATCHUP_AND_WS, WsClient, WsConfig, WsError, WsHandler, WsResult,
    run_ws_client,
};
use uuid::Uuid;

use crate::services::{
    auth::AuthContext, git::GitServiceError, github_service::GitHubServiceError,
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
    #[error("invalid user ID format")]
    InvalidUserId,
    #[error("invalid organization ID format")]
    InvalidOrganizationId,
}

const WS_BACKOFF_BASE_DELAY: Duration = Duration::from_secs(1);
const WS_BACKOFF_MAX_DELAY: Duration = Duration::from_secs(30);

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
    auth_ctx: AuthContext,
}

impl RemoteSync {
    pub fn spawn(db: DBService, config: ShareConfig, auth_ctx: AuthContext) -> RemoteSyncHandle {
        tracing::info!(api = %config.api_base, "starting shared task synchronizer");
        let processor = ActivityProcessor::new(db.clone(), config.clone(), auth_ctx.clone());
        let sync = Self {
            db,
            processor,
            config,
            auth_ctx,
        };
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let join = tokio::spawn(async move {
            if let Err(e) = sync.run(shutdown_rx).await {
                tracing::error!(?e, "remote sync terminated unexpectedly");
            }
        });

        RemoteSyncHandle::new(shutdown_tx, join)
    }

    pub async fn run(self, mut shutdown_rx: oneshot::Receiver<()>) -> Result<(), ShareError> {
        let mut backoff = Backoff::new();
        loop {
            let profile = self.auth_ctx.cached_profile().await;
            let Some(org_id_str) = profile.as_ref().map(|p| p.organization_id.clone()) else {
                tracing::debug!("No authentication available; waiting before retry");
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        tracing::info!("shutdown received while waiting for auth");
                        return Ok(());
                    }
                    _ = backoff.wait() => {}
                }
                continue;
            };

            let org_id = org_id_str
                .parse::<Uuid>()
                .map_err(|_| ShareError::InvalidOrganizationId)?;

            let mut last_seq = SharedActivityCursor::get(&self.db.pool, org_id)
                .await?
                .map(|cursor| cursor.last_seq);
            last_seq = self.processor.catch_up(last_seq).await.unwrap_or(last_seq);

            let ws_url = self.config.websocket_endpoint(last_seq)?;
            let (close_tx, close_rx) = oneshot::channel();
            let ws_connection = match spawn_shared_remote(
                self.processor.clone(),
                &self.auth_ctx,
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
    auth_ctx: &AuthContext,
    url: Url,
    close_tx: oneshot::Sender<()>,
) -> Result<WsClient, ShareError> {
    let auth_source = auth_ctx.clone();
    let ws_config = WsConfig {
        url,
        ping_interval: Some(std::time::Duration::from_secs(30)),
        header_factory: Some(Arc::new(move || {
            let auth_source = auth_source.clone();
            Box::pin(async move {
                match auth_source
                    .wait_for_auth(WS_MAX_DELAY_BETWEEN_CATCHUP_AND_WS)
                    .await
                {
                    Some((access_token, _user_id, _org_id)) => build_ws_headers(&access_token),
                    None => Err(WsError::MissingAuth),
                }
            })
        })),
    };

    let handler = SharedWsHandler {
        processor,
        close_tx: Some(close_tx),
    };
    let client = run_ws_client(handler, ws_config)
        .await
        .map_err(ShareError::from)?;

    Ok(client)
}

fn build_ws_headers(access_token: &str) -> WsResult<Vec<(HeaderName, HeaderValue)>> {
    let mut headers = Vec::new();
    let value = format!("Bearer {access_token}");
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
    project_id: Option<Uuid>,
    github_repo_id: Option<i64>,
    last_event_seq: Option<i64>,
) -> SharedTaskInput {
    SharedTaskInput {
        id: task.id,
        organization_id: task.organization_id,
        project_id,
        github_repo_id,
        title: task.title.clone(),
        description: task.description.clone(),
        status: status::from_remote(&task.status),
        assignee_user_id: task.assignee_user_id,
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
    current_user_id: Option<uuid::Uuid>,
    creator_user_id: Option<uuid::Uuid>,
) -> Result<(), ShareError> {
    let project_id = match shared_task.project_id {
        Some(project_id) => project_id,
        None => return Ok(()),
    };

    let create_task_if_not_exists = {
        let assignee_is_current_user = matches!(
            (shared_task.assignee_user_id.as_ref(), current_user_id.as_ref()),
            (Some(assignee), Some(current)) if assignee == current
        );
        let creator_is_current_user = matches!((creator_user_id.as_ref(), current_user_id.as_ref()), (Some(creator), Some(current)) if creator == current);

        assignee_is_current_user && !creator_is_current_user
    };

    Task::sync_from_shared_task(
        pool,
        SyncTask {
            shared_task_id: shared_task.id,
            project_id,
            title: shared_task.title.clone(),
            description: shared_task.description.clone(),
            status: shared_task.status.clone(),
        },
        create_task_if_not_exists,
    )
    .await?;

    Ok(())
}

pub async fn link_shared_tasks_to_project(
    pool: &SqlitePool,
    current_user_id: Option<uuid::Uuid>,
    project_id: Uuid,
    github_repo_id: i64,
) -> Result<(), ShareError> {
    let linked_tasks =
        SharedTask::link_to_project_by_repo_id(pool, github_repo_id, project_id).await?;

    if linked_tasks.is_empty() {
        return Ok(());
    }

    for task in linked_tasks {
        sync_local_task_for_shared_task(pool, &task, current_user_id, None).await?;
    }

    Ok(())
}
