mod config;
mod processor;
mod publisher;

use std::sync::{Arc, Mutex as StdMutex};

use async_trait::async_trait;
use config::RemoteSyncConfig;
use db::{
    DBService,
    models::{
        shared_task::{SharedActivityCursor, SharedTaskInput},
        task::TaskStatus,
    },
};
use processor::ActivityProcessor;
pub use publisher::ShareTaskPublisher;
use remote::{
    ServerMessage,
    db::tasks::{SharedTask as RemoteSharedTask, TaskStatus as RemoteTaskStatus},
};
use thiserror::Error;
use tokio::{sync::oneshot, task::JoinHandle};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use utils::ws::{WsClient, WsConfig, WsError, WsHandler, run_ws_client};
use uuid::Uuid;

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
}

pub struct RemoteSync {
    db: DBService,
    processor: ActivityProcessor,
    remote_client: Option<Arc<WsClient>>,
    config: RemoteSyncConfig,
}

impl RemoteSync {
    pub fn spawn_if_configured(db: DBService) -> Option<RemoteSyncHandle> {
        if let Some(config) = RemoteSyncConfig::from_env() {
            tracing::info!(org_id = %config.organization_id, "starting shared task synchronizer");
            let processor = ActivityProcessor::new(db.clone(), config.clone());
            let sync = Self {
                db,
                processor,
                remote_client: None,
                config,
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

    pub async fn run(mut self, shutdown_rx: oneshot::Receiver<()>) -> Result<(), ShareError> {
        let mut last_seq =
            SharedActivityCursor::get(&self.db.pool, self.config.organization_id.to_string())
                .await?
                .map(|cursor| cursor.last_seq);
        last_seq = self.processor.catch_up(last_seq).await.unwrap_or(last_seq);

        let ws_url = self.config.websocket_endpoint(last_seq);
        let remote = spawn_shared_remote(self.processor.clone(), &ws_url).await?;
        self.remote_client = Some(remote);

        let _ = shutdown_rx.await;
        tracing::info!("shutdown signal received for remote sync");

        self.request_shutdown().await;
        Ok(())
    }

    async fn request_shutdown(&mut self) {
        if let Some(client) = self.remote_client.take()
            && let Err(err) = client.shutdown()
        {
            tracing::warn!(?err, "failed to request websocket shutdown");
        }
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
                    self.processor
                        .process_event(event.clone())
                        .await
                        .map_err(|err| WsError::Handler(Box::new(err)))?;

                    tracing::debug!(seq = event.seq, "processed remote activity");
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
    url: &str,
) -> Result<Arc<WsClient>, ShareError> {
    let ws_config = WsConfig {
        url: url.to_string(),
        autoreconnect: true,
        reconnect_base_delay: std::time::Duration::from_secs(1),
        reconnect_max_delay: std::time::Duration::from_secs(30),
        ping_interval: Some(std::time::Duration::from_secs(30)),
    };

    let handler = SharedWsHandler { processor };
    let client = Arc::new(run_ws_client(handler, ws_config).await?);

    Ok(client)
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

fn convert_remote_task(task: &RemoteSharedTask, last_event_seq: Option<i64>) -> SharedTaskInput {
    SharedTaskInput {
        id: task.id,
        organization_id: task.organization_id.clone(),
        project_id: task.project_id,
        title: task.title.clone(),
        description: task.description.clone(),
        status: convert_remote_status(&task.status),
        assignee_user_id: task.assignee_user_id.clone(),
        version: task.version,
        last_event_seq,
        created_at: task.created_at,
        updated_at: task.updated_at,
    }
}

fn convert_remote_status(status: &RemoteTaskStatus) -> TaskStatus {
    match status {
        RemoteTaskStatus::Todo => TaskStatus::Todo,
        RemoteTaskStatus::InProgress => TaskStatus::InProgress,
        RemoteTaskStatus::InReview => TaskStatus::InReview,
        RemoteTaskStatus::Done => TaskStatus::Done,
        RemoteTaskStatus::Cancelled => TaskStatus::Cancelled,
    }
}

fn convert_local_status(status: &TaskStatus) -> RemoteTaskStatus {
    match status {
        TaskStatus::Todo => RemoteTaskStatus::Todo,
        TaskStatus::InProgress => RemoteTaskStatus::InProgress,
        TaskStatus::InReview => RemoteTaskStatus::InReview,
        TaskStatus::Done => RemoteTaskStatus::Done,
        TaskStatus::Cancelled => RemoteTaskStatus::Cancelled,
    }
}
