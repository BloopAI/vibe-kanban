mod config;
mod processor;
mod publisher;
pub mod status;

use std::{
    collections::{HashMap, HashSet},
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
    ClientMessage, ServerMessage,
    db::{tasks::SharedTask as RemoteSharedTask, users::UserData as RemoteUserData},
};
use sqlx::{Executor, Sqlite, SqlitePool};
use thiserror::Error;
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::{MissedTickBehavior, interval, sleep},
};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use url::Url;
use utils::ws::{
    WS_AUTH_REFRESH_INTERVAL, WsClient, WsConfig, WsError, WsHandler, WsResult, run_ws_client,
};
use uuid::Uuid;

use crate::{
    RemoteClientError,
    services::{
        auth::AuthContext, git::GitServiceError, github::GitHubServiceError,
        remote_client::RemoteClient,
    },
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
    #[error("project {0} is not linked to a remote project")]
    ProjectNotLinked(Uuid),
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
    #[error(transparent)]
    RemoteClientError(#[from] RemoteClientError),
}

const WS_BACKOFF_BASE_DELAY: Duration = Duration::from_secs(1);
const WS_BACKOFF_MAX_DELAY: Duration = Duration::from_secs(30);
const WS_BACKOFF_MAX_FAILURES: u32 = 10;
const AUTH_WAIT_MAX_RETRIES: u32 = 5;

struct Backoff {
    current: Duration,
    failure_count: u32,
}

impl Backoff {
    fn new() -> Self {
        Self {
            current: WS_BACKOFF_BASE_DELAY,
            failure_count: 0,
        }
    }

    fn reset(&mut self) {
        self.current = WS_BACKOFF_BASE_DELAY;
        self.failure_count = 0;
    }

    fn should_give_up(&self) -> bool {
        self.failure_count >= WS_BACKOFF_MAX_FAILURES
    }

    async fn wait(&mut self) {
        self.failure_count += 1;
        let wait = self.current;
        sleep(wait).await;
        let doubled = wait.checked_mul(2).unwrap_or(WS_BACKOFF_MAX_DELAY);
        self.current = std::cmp::min(doubled, WS_BACKOFF_MAX_DELAY);
    }
}

struct ProjectWatcher {
    shutdown: oneshot::Sender<()>,
    join: JoinHandle<()>,
}

struct ProjectWatcherEvent {
    project_id: Uuid,
    result: Result<(), ShareError>,
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
        let remote_client = RemoteClient::new(config.api_base.as_str(), auth_ctx.clone())
            .expect("failed to create remote client");
        let processor =
            ActivityProcessor::new(db.clone(), config.clone(), remote_client, auth_ctx.clone());
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
        let mut watchers: HashMap<Uuid, ProjectWatcher> = HashMap::new();
        let (event_tx, mut event_rx) = mpsc::unbounded_channel();
        let mut refresh_interval = interval(Duration::from_secs(5));
        refresh_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        // On startup, sync all unshared tasks for Hive-linked projects
        self.sync_unshared_tasks_on_startup().await;

        self.reconcile_watchers(&mut watchers, &event_tx).await?;

        loop {
            tokio::select! {
                _ = &mut shutdown_rx => {
                    tracing::info!("remote sync shutdown requested");
                    for (project_id, watcher) in watchers.drain() {
                        tracing::info!(%project_id, "stopping watcher due to shutdown");
                        let _ = watcher.shutdown.send(());
                        tokio::spawn(async move {
                            if let Err(err) = watcher.join.await {
                                tracing::debug!(?err, %project_id, "project watcher join failed during shutdown");
                            }
                        });
                    }
                    return Ok(());
                }
                Some(event) = event_rx.recv() => {
                    match event.result {
                        Ok(()) => {
                            tracing::debug!(project_id = %event.project_id, "project watcher exited cleanly");
                        }
                        Err(err) => {
                            tracing::warn!(project_id = %event.project_id, ?err, "project watcher terminated with error");
                        }
                    }
                    watchers.remove(&event.project_id);
                }
                _ = refresh_interval.tick() => {
                    self.reconcile_watchers(&mut watchers, &event_tx).await?;
                }
            }
        }
    }

    async fn reconcile_watchers(
        &self,
        watchers: &mut HashMap<Uuid, ProjectWatcher>,
        events_tx: &mpsc::UnboundedSender<ProjectWatcherEvent>,
    ) -> Result<(), ShareError> {
        let linked_projects = self.linked_remote_projects().await?;
        let desired: HashSet<Uuid> = linked_projects.iter().copied().collect();

        for project_id in linked_projects {
            if let std::collections::hash_map::Entry::Vacant(e) = watchers.entry(project_id) {
                tracing::info!(%project_id, "starting watcher for linked remote project");
                let watcher = self
                    .spawn_project_watcher(project_id, events_tx.clone())
                    .await?;
                e.insert(watcher);
            }
        }

        let to_remove: Vec<Uuid> = watchers
            .keys()
            .copied()
            .filter(|id| !desired.contains(id))
            .collect();

        for project_id in to_remove {
            if let Some(watcher) = watchers.remove(&project_id) {
                tracing::info!(%project_id, "remote project unlinked; shutting down watcher");
                let _ = watcher.shutdown.send(());
                tokio::spawn(async move {
                    if let Err(err) = watcher.join.await {
                        tracing::debug!(?err, %project_id, "project watcher join failed during teardown");
                    }
                });
            }
        }

        Ok(())
    }

    /// Sync all unshared tasks for all Hive-linked projects on startup.
    /// This ensures that any tasks created while disconnected are automatically shared.
    /// Does not require a logged-in user - tasks will be shared without an assignee if needed.
    async fn sync_unshared_tasks_on_startup(&self) {
        let remote_client = RemoteClient::new(self.config.api_base.as_str(), self.auth_ctx.clone());
        let Ok(remote_client) = remote_client else {
            tracing::warn!("Failed to create remote client for startup sync");
            return;
        };

        let publisher = SharePublisher::new(self.db.clone(), remote_client);

        // Get user_id if available, but don't require it
        let user_id = self.auth_ctx.cached_profile().await.map(|p| p.user_id);

        match sync_all_hive_linked_projects(&self.db.pool, &publisher, user_id).await {
            Ok((projects, tasks)) => {
                if tasks > 0 {
                    tracing::info!(
                        projects_synced = projects,
                        tasks_shared = tasks,
                        "Startup sync: shared unshared tasks to Hive"
                    );
                } else {
                    tracing::debug!("Startup sync: no unshared tasks to sync");
                }
            }
            Err(e) => {
                tracing::warn!(error = ?e, "Startup sync failed");
            }
        }
    }

    async fn linked_remote_projects(&self) -> Result<Vec<Uuid>, ShareError> {
        let rows = sqlx::query_scalar::<_, Uuid>(
            r#"
            SELECT remote_project_id
            FROM projects
            WHERE remote_project_id IS NOT NULL
            "#,
        )
        .fetch_all(&self.db.pool)
        .await?;

        Ok(rows)
    }

    async fn spawn_project_watcher(
        &self,
        project_id: Uuid,
        events_tx: mpsc::UnboundedSender<ProjectWatcherEvent>,
    ) -> Result<ProjectWatcher, ShareError> {
        let processor = self.processor.clone();
        let config = self.config.clone();
        let auth_ctx = self.auth_ctx.clone();
        let remote_client = processor.remote_client();
        let db = self.db.clone();
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let join = tokio::spawn(async move {
            let result = project_watcher_task(
                db,
                processor,
                config,
                auth_ctx,
                remote_client,
                project_id,
                shutdown_rx,
            )
            .await;

            let _ = events_tx.send(ProjectWatcherEvent { project_id, result });
        });

        Ok(ProjectWatcher {
            shutdown: shutdown_tx,
            join,
        })
    }
}

struct SharedWsHandler {
    processor: ActivityProcessor,
    close_tx: Option<oneshot::Sender<()>>,
    remote_project_id: Uuid,
}

#[async_trait]
impl WsHandler for SharedWsHandler {
    async fn handle_message(&mut self, msg: WsMessage) -> Result<(), WsError> {
        if let WsMessage::Text(txt) = msg {
            match serde_json::from_str::<ServerMessage>(&txt) {
                Ok(ServerMessage::Activity(event)) => {
                    let seq = event.seq;
                    if event.project_id != self.remote_project_id {
                        tracing::warn!(
                            expected = %self.remote_project_id,
                            received = %event.project_id,
                            "received activity for unexpected project via websocket"
                        );
                        return Ok(());
                    }
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
    remote_client: RemoteClient,
    url: Url,
    close_tx: oneshot::Sender<()>,
    remote_project_id: Uuid,
) -> Result<WsClient, ShareError> {
    let remote_client_clone = remote_client.clone();
    let ws_config = WsConfig {
        url,
        ping_interval: Some(std::time::Duration::from_secs(30)),
        header_factory: Some(Arc::new(move || {
            let remote_client_clone = remote_client_clone.clone();
            Box::pin(async move {
                match remote_client_clone.access_token().await {
                    Ok(token) => build_ws_headers(&token),
                    Err(error) => {
                        tracing::warn!(
                            ?error,
                            "failed to obtain access token for websocket connection"
                        );
                        Err(WsError::MissingAuth)
                    }
                }
            })
        })),
    };

    let handler = SharedWsHandler {
        processor,
        close_tx: Some(close_tx),
        remote_project_id,
    };
    let client = run_ws_client(handler, ws_config)
        .await
        .map_err(ShareError::from)?;
    spawn_ws_auth_refresh_task(client.clone(), remote_client);

    Ok(client)
}

async fn project_watcher_task(
    db: DBService,
    processor: ActivityProcessor,
    config: ShareConfig,
    auth_ctx: AuthContext,
    remote_client: RemoteClient,
    remote_project_id: Uuid,
    mut shutdown_rx: oneshot::Receiver<()>,
) -> Result<(), ShareError> {
    let mut backoff = Backoff::new();
    let mut auth_wait_count = 0u32;

    loop {
        // Check if we've exceeded max failures - give up and let reconcile restart us later
        if backoff.should_give_up() {
            tracing::warn!(
                %remote_project_id,
                failures = backoff.failure_count,
                "too many consecutive failures, watcher exiting"
            );
            return Err(ShareError::MissingAuth);
        }

        if auth_ctx.cached_profile().await.is_none() {
            auth_wait_count += 1;
            if auth_wait_count > AUTH_WAIT_MAX_RETRIES {
                tracing::warn!(
                    %remote_project_id,
                    attempts = auth_wait_count,
                    "auth wait timeout exceeded, watcher exiting"
                );
                return Err(ShareError::MissingAuth);
            }
            tracing::debug!(
                %remote_project_id,
                attempt = auth_wait_count,
                max_attempts = AUTH_WAIT_MAX_RETRIES,
                "waiting for authentication before syncing project"
            );
            tokio::select! {
                _ = &mut shutdown_rx => return Ok(()),
                _ = backoff.wait() => {}
            }
            continue;
        }
        // Reset auth wait count on successful auth
        auth_wait_count = 0;

        let mut last_seq = SharedActivityCursor::get(&db.pool, remote_project_id)
            .await?
            .map(|cursor| cursor.last_seq);

        match processor
            .catch_up_project(remote_project_id, last_seq)
            .await
        {
            Ok(seq) => {
                last_seq = seq;
            }
            Err(ShareError::MissingAuth) => {
                tracing::debug!(%remote_project_id, "missing auth during catch-up; retrying after backoff");
                tokio::select! {
                    _ = &mut shutdown_rx => return Ok(()),
                    _ = backoff.wait() => {}
                }
                continue;
            }
            Err(err) => return Err(err),
        }

        let ws_url = match config.websocket_endpoint(remote_project_id, last_seq) {
            Ok(url) => url,
            Err(err) => return Err(ShareError::Url(err)),
        };

        let (close_tx, close_rx) = oneshot::channel();
        let ws_connection = match spawn_shared_remote(
            processor.clone(),
            remote_client.clone(),
            ws_url,
            close_tx,
            remote_project_id,
        )
        .await
        {
            Ok(conn) => {
                backoff.reset();
                conn
            }
            Err(ShareError::MissingAuth) => {
                tracing::debug!(%remote_project_id, "missing auth during websocket connect; retrying");
                tokio::select! {
                    _ = &mut shutdown_rx => return Ok(()),
                    _ = backoff.wait() => {}
                }
                continue;
            }
            Err(err) => {
                tracing::error!(%remote_project_id, ?err, "failed to establish websocket; retrying");
                tokio::select! {
                    _ = &mut shutdown_rx => return Ok(()),
                    _ = backoff.wait() => {}
                }
                continue;
            }
        };

        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!(%remote_project_id, "shutdown signal received for project watcher");
                if let Err(err) = ws_connection.close() {
                    tracing::debug!(?err, %remote_project_id, "failed to close websocket during shutdown");
                }
                return Ok(());
            }
            res = close_rx => {
                match res {
                    Ok(()) => {
                        tracing::info!(%remote_project_id, "project websocket closed; scheduling reconnect");
                    }
                    Err(_) => {
                        tracing::warn!(%remote_project_id, "project websocket close signal dropped");
                    }
                }
                if let Err(err) = ws_connection.close() {
                    tracing::debug!(?err, %remote_project_id, "project websocket already closed when reconnecting");
                }
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        tracing::info!(%remote_project_id, "shutdown received during reconnect wait");
                        return Ok(());
                    }
                    _ = backoff.wait() => {}
                }
            }
        }
    }
}

fn build_ws_headers(access_token: &str) -> WsResult<Vec<(HeaderName, HeaderValue)>> {
    let mut headers = Vec::new();
    let value = format!("Bearer {access_token}");
    let header = HeaderValue::from_str(&value).map_err(|err| WsError::Header(err.to_string()))?;
    headers.push((AUTHORIZATION, header));
    Ok(headers)
}

fn spawn_ws_auth_refresh_task(client: WsClient, remote_client: RemoteClient) {
    tokio::spawn(async move {
        let mut close_rx = client.subscribe_close();
        loop {
            match remote_client.access_token().await {
                Ok(token) => {
                    if let Err(err) = send_ws_auth_token(&client, token).await {
                        tracing::warn!(
                            ?err,
                            "failed to send websocket auth token; stopping auth refresh"
                        );
                        break;
                    }
                }
                Err(err) => {
                    tracing::warn!(
                        ?err,
                        "failed to obtain access token for websocket auth refresh; stopping auth refresh"
                    );
                    break;
                }
            }

            tokio::select! {
                _ = close_rx.changed() => break,
                _ = sleep(WS_AUTH_REFRESH_INTERVAL) => {}
            }
        }
    });
}

async fn send_ws_auth_token(client: &WsClient, token: String) -> Result<(), ShareError> {
    let payload = serde_json::to_string(&ClientMessage::AuthToken { token })?;
    client
        .send(WsMessage::Text(payload.into()))
        .map_err(ShareError::from)
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
    last_event_seq: Option<i64>,
) -> SharedTaskInput {
    SharedTaskInput {
        id: task.id,
        remote_project_id: task.project_id,
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

pub(super) async fn sync_local_task_for_shared_task<'e, E>(
    executor: E,
    shared_task: &SharedTask,
    current_user_id: Option<uuid::Uuid>,
    creator_user_id: Option<uuid::Uuid>,
    project_id: Option<Uuid>,
) -> Result<(), ShareError>
where
    E: Executor<'e, Database = Sqlite>,
{
    let Some(project_id) = project_id else {
        return Ok(());
    };

    let create_task_if_not_exists = {
        let assignee_is_current_user = matches!(
            (shared_task.assignee_user_id.as_ref(), current_user_id.as_ref()),
            (Some(assignee), Some(current)) if assignee == current
        );
        let creator_is_current_user = matches!((creator_user_id.as_ref(), current_user_id.as_ref()), (Some(creator), Some(current)) if creator == current);

        assignee_is_current_user
            && !(creator_is_current_user && SHARED_TASK_LINKING_LOCK.lock().unwrap().is_locked())
    };

    Task::sync_from_shared_task(
        executor,
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
    remote_project_id: Uuid,
) -> Result<(), ShareError> {
    let tasks = SharedTask::list_by_remote_project_id(pool, remote_project_id).await?;

    if tasks.is_empty() {
        return Ok(());
    }

    for task in tasks {
        sync_local_task_for_shared_task(pool, &task, current_user_id, None, Some(project_id))
            .await?;
    }

    Ok(())
}

/// Sync all unshared tasks for all Hive-linked projects.
///
/// The `user_id` is optional - if not provided, tasks will be shared without an assignee.
/// This allows the sync to run without requiring a logged-in user (e.g., on node startup).
pub async fn sync_all_hive_linked_projects(
    pool: &SqlitePool,
    publisher: &SharePublisher,
    user_id: Option<Uuid>,
) -> Result<(usize, usize), ShareError> {
    use db::models::project::Project;

    // Find all projects that are linked to the Hive (have remote_project_id)
    let all_projects = Project::find_all(pool).await?;
    let linked_projects: Vec<_> = all_projects
        .into_iter()
        .filter(|p| p.remote_project_id.is_some())
        .collect();

    if linked_projects.is_empty() {
        tracing::debug!("No Hive-linked projects to sync");
        return Ok((0, 0));
    }

    tracing::info!(
        project_count = linked_projects.len(),
        "Starting sync for Hive-linked projects"
    );

    let mut total_projects_synced = 0;
    let mut total_tasks_shared = 0;

    for project in linked_projects {
        match share_existing_tasks_to_hive(pool, publisher, project.id, user_id).await {
            Ok(count) => {
                if count > 0 {
                    total_projects_synced += 1;
                    total_tasks_shared += count;
                }
            }
            Err(e) => {
                tracing::warn!(
                    project_id = %project.id,
                    project_name = %project.name,
                    error = ?e,
                    "Failed to sync project tasks to Hive on startup"
                );
            }
        }
    }

    tracing::info!(
        total_projects_synced,
        total_tasks_shared,
        "Completed startup sync for Hive-linked projects"
    );

    Ok((total_projects_synced, total_tasks_shared))
}

/// Share all existing local tasks for a project to the Hive.
/// Called when a project is first linked to the Hive to push all existing tasks.
pub async fn share_existing_tasks_to_hive(
    pool: &SqlitePool,
    publisher: &SharePublisher,
    project_id: Uuid,
    user_id: Option<Uuid>,
) -> Result<usize, ShareError> {
    // Get all tasks for this project that haven't been shared yet
    let tasks_with_status = Task::find_by_project_id_with_attempt_status(pool, project_id).await?;

    let mut shared_count = 0;
    for task_with_status in tasks_with_status {
        let task = task_with_status.task;

        // Skip tasks that are already shared
        if task.shared_task_id.is_some() {
            continue;
        }

        match publisher.share_task(task.id, user_id).await {
            Ok(shared_task_id) => {
                tracing::info!(
                    task_id = %task.id,
                    shared_task_id = %shared_task_id,
                    "Shared existing task to Hive during project linking"
                );
                shared_count += 1;
            }
            Err(e) => {
                tracing::warn!(
                    task_id = %task.id,
                    error = ?e,
                    "Failed to share existing task to Hive during project linking"
                );
            }
        }
    }

    tracing::info!(
        project_id = %project_id,
        shared_count,
        "Finished sharing existing tasks to Hive"
    );

    Ok(shared_count)
}

// Prevent duplicate local tasks from being created during task sharing.
// The activity event handler can create a duplicate local task when it receives a shared task assigned to the current user.
lazy_static::lazy_static! {
    pub(super) static ref SHARED_TASK_LINKING_LOCK: StdMutex<SharedTaskLinkingLock> = StdMutex::new(SharedTaskLinkingLock::new());
}

#[derive(Debug)]
pub(super) struct SharedTaskLinkingLock {
    count: usize,
}

impl SharedTaskLinkingLock {
    fn new() -> Self {
        Self { count: 0 }
    }

    pub(super) fn is_locked(&self) -> bool {
        self.count > 0
    }

    #[allow(dead_code)]
    pub(super) fn guard(&mut self) -> SharedTaskLinkingGuard {
        self.count += 1;
        SharedTaskLinkingGuard
    }
}

#[allow(dead_code)]
pub(super) struct SharedTaskLinkingGuard;

impl Drop for SharedTaskLinkingGuard {
    fn drop(&mut self) {
        SHARED_TASK_LINKING_LOCK.lock().unwrap().count -= 1;
    }
}
