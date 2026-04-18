//! Node runner for local deployments to connect to a remote hive.
//!
//! This module provides the integration between a local Vibe Kanban instance
//! and a remote hive server, allowing the local instance to receive and execute
//! tasks dispatched from the hive.

use std::collections::HashMap;
use std::sync::Arc;

use db::DBService;
use db::models::{
    label::Label, project::Project, task::Task, task::TaskStatus, task_attempt::TaskAttempt,
};
use remote::db::tasks::TaskStatus as RemoteTaskStatus;
use sqlx::SqlitePool;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

use super::hive_client::{
    AttemptSyncMessage, ExecutionSyncMessage, HiveClient, HiveClientConfig, HiveClientError,
    HiveEvent, LabelSyncBroadcastMessage, LinkProjectMessage, LinkedProjectInfo, LogsBatchMessage,
    NodeMessage, SwarmLabelInfo, TaskExecutionStatus, TaskStatusMessage, UnlinkProjectMessage,
    detect_capabilities, get_machine_id,
};
use super::node_cache;
use super::remote_client::{RemoteClient, RemoteClientError};

/// Configuration for the node runner loaded from environment variables.
#[derive(Debug, Clone)]
pub struct NodeRunnerConfig {
    /// URL of the hive server (e.g., "wss://hive.example.com")
    pub hive_url: String,
    /// API key for authenticating with the hive
    pub api_key: String,
    /// Human-readable name for this node
    pub node_name: String,
    /// Public URL for this node (optional, for direct connections)
    pub public_url: Option<String>,
    /// JWT secret for validating connection tokens (optional)
    /// When set, enables direct frontend-to-node log streaming
    pub connection_token_secret: Option<secrecy::SecretString>,
}

impl NodeRunnerConfig {
    /// Load configuration from environment variables.
    ///
    /// Required:
    /// - `VK_HIVE_URL`: URL of the hive server
    /// - `VK_NODE_API_KEY`: API key for authentication
    ///
    /// Optional:
    /// - `VK_NODE_NAME`: Human-readable name (defaults to hostname)
    /// - `VK_NODE_PUBLIC_URL`: Public URL for direct connections
    /// - `VK_CONNECTION_TOKEN_SECRET`: JWT secret for validating connection tokens
    ///   (enables direct frontend-to-node log streaming)
    pub fn from_env() -> Option<Self> {
        let hive_url = std::env::var("VK_HIVE_URL").ok();
        let api_key = std::env::var("VK_NODE_API_KEY").ok();
        let shared_api_base = std::env::var("VK_SHARED_API_BASE").ok();

        // If shared API is configured but hive URL is missing, warn the user
        // This often indicates a typo in the .env file (e.g., "bVK_HIVE_URL" instead of "VK_HIVE_URL")
        if shared_api_base.is_some() && hive_url.is_none() {
            tracing::warn!(
                "VK_SHARED_API_BASE is set but VK_HIVE_URL is missing. \
                 Node will not connect to hive for task dispatch. \
                 Check for typos in your .env file."
            );
        }

        let hive_url = hive_url?;

        // Validate URL format
        if !hive_url.starts_with("ws://") && !hive_url.starts_with("wss://") {
            tracing::error!(
                hive_url = %hive_url,
                "VK_HIVE_URL must start with 'ws://' or 'wss://'. \
                 Use 'ws://' for local development or 'wss://' for production."
            );
            return None;
        }

        let api_key = match api_key {
            Some(key) if !key.is_empty() => key,
            _ => {
                tracing::warn!(
                    "VK_HIVE_URL is set but VK_NODE_API_KEY is missing or empty. \
                     Node cannot authenticate with hive. \
                     Generate an API key from the hive server."
                );
                return None;
            }
        };

        let node_name = std::env::var("VK_NODE_NAME").unwrap_or_else(|_| {
            hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "vibe-kanban-node".to_string())
        });

        let public_url = std::env::var("VK_NODE_PUBLIC_URL").ok();

        let connection_token_secret = std::env::var("VK_CONNECTION_TOKEN_SECRET")
            .ok()
            .map(secrecy::SecretString::from);

        // Log masked config for debugging
        let masked_key = if api_key.len() > 8 {
            format!("{}...{}", &api_key[..4], &api_key[api_key.len() - 4..])
        } else {
            "****".to_string()
        };
        tracing::debug!(
            hive_url = %hive_url,
            api_key = %masked_key,
            node_name = %node_name,
            public_url = ?public_url,
            has_connection_secret = connection_token_secret.is_some(),
            "Node runner config loaded from environment"
        );

        Some(Self {
            hive_url,
            api_key,
            node_name,
            public_url,
            connection_token_secret,
        })
    }
}

/// Info about a remote project from another node in the organization.
#[derive(Debug, Clone)]
pub struct RemoteProjectInfo {
    pub link_id: Uuid,
    pub project_id: Uuid,
    pub project_name: String,
    pub local_project_id: Uuid,
    pub git_repo_path: String,
    pub default_branch: String,
    pub source_node_id: Uuid,
    pub source_node_name: String,
    pub source_node_public_url: Option<String>,
}

/// Mapping from hive project links to local project IDs.
#[derive(Debug, Clone, Default)]
pub struct ProjectMapping {
    /// Maps link_id -> local project info (this node's projects)
    links: HashMap<Uuid, LinkedProjectInfo>,
    /// Maps local_project_id -> link_id
    local_to_link: HashMap<Uuid, Uuid>,
    /// Remote projects from other nodes in the organization
    remote_projects: HashMap<Uuid, RemoteProjectInfo>,
}

impl ProjectMapping {
    pub fn new() -> Self {
        Self::default()
    }

    /// Update from auth response which now includes ALL organization projects.
    ///
    /// Projects with `is_owned == true` go into `links` (this node's projects).
    /// Projects with `is_owned == false` go into `remote_projects` (other nodes' projects).
    pub fn update_from_links(&mut self, links: Vec<LinkedProjectInfo>) {
        self.links.clear();
        self.local_to_link.clear();
        self.remote_projects.clear();

        for link in links {
            if link.is_owned {
                // This node owns this project
                self.local_to_link
                    .insert(link.local_project_id, link.link_id);
                self.links.insert(link.link_id, link);
            } else {
                // Another node owns this project - add as remote
                self.remote_projects.insert(
                    link.link_id,
                    RemoteProjectInfo {
                        link_id: link.link_id,
                        project_id: link.project_id,
                        project_name: link.project_name,
                        local_project_id: link.local_project_id,
                        git_repo_path: link.git_repo_path,
                        default_branch: link.default_branch,
                        source_node_id: link.source_node_id.unwrap_or_default(),
                        source_node_name: link.source_node_name.unwrap_or_default(),
                        source_node_public_url: None, // Not included in auth response
                    },
                );
            }
        }
    }

    pub fn add_link(&mut self, link: LinkedProjectInfo) {
        self.local_to_link
            .insert(link.local_project_id, link.link_id);
        self.links.insert(link.link_id, link);
    }

    /// Add a remote project from another node.
    pub fn add_remote_project(&mut self, project: RemoteProjectInfo) {
        self.remote_projects.insert(project.link_id, project);
    }

    /// Remove a remote project by link_id.
    pub fn remove_remote_project(&mut self, link_id: Uuid) {
        self.remote_projects.remove(&link_id);
    }

    /// Remove all projects from a specific node.
    pub fn remove_projects_from_node(&mut self, node_id: Uuid) {
        self.remote_projects
            .retain(|_, p| p.source_node_id != node_id);
    }

    /// Get all remote projects.
    #[allow(dead_code)]
    pub fn remote_projects(&self) -> impl Iterator<Item = &RemoteProjectInfo> {
        self.remote_projects.values()
    }

    #[allow(dead_code)]
    pub fn get_by_link_id(&self, link_id: Uuid) -> Option<&LinkedProjectInfo> {
        self.links.get(&link_id)
    }

    #[allow(dead_code)]
    pub fn get_by_local_project_id(&self, local_project_id: Uuid) -> Option<&LinkedProjectInfo> {
        self.local_to_link
            .get(&local_project_id)
            .and_then(|link_id| self.links.get(link_id))
    }
}

/// Active task assignment being executed on this node.
#[derive(Debug, Clone)]
pub struct ActiveAssignment {
    pub assignment_id: Uuid,
    pub task_id: Uuid,
    pub local_task_id: Option<Uuid>,
    pub local_attempt_id: Option<Uuid>,
    pub status: TaskExecutionStatus,
}

/// Node runner state.
pub struct NodeRunnerState {
    /// Node ID assigned by the hive
    pub node_id: Option<Uuid>,
    /// Organization ID this node belongs to
    pub organization_id: Option<Uuid>,
    /// Project mappings
    pub project_mapping: ProjectMapping,
    /// Active task assignments
    pub active_assignments: HashMap<Uuid, ActiveAssignment>,
    /// Whether connected to the hive
    pub connected: bool,
}

impl Default for NodeRunnerState {
    fn default() -> Self {
        Self {
            node_id: None,
            organization_id: None,
            project_mapping: ProjectMapping::new(),
            active_assignments: HashMap::new(),
            connected: false,
        }
    }
}

/// Context for interacting with the node runner from other parts of the app.
///
/// This struct provides read access to the node runner state and the ability
/// to send messages to the hive.
#[derive(Clone)]
pub struct NodeRunnerContext {
    /// Shared state (read-only access for checking connection status, etc.)
    pub state: Arc<RwLock<NodeRunnerState>>,
    /// Sender for commands to the hive
    command_tx: mpsc::Sender<NodeMessage>,
}

impl NodeRunnerContext {
    /// Check if connected to the hive.
    pub async fn is_connected(&self) -> bool {
        self.state.read().await.connected
    }

    /// Get the current node ID if connected.
    pub async fn node_id(&self) -> Option<Uuid> {
        self.state.read().await.node_id
    }

    /// Get the organization ID if connected.
    pub async fn organization_id(&self) -> Option<Uuid> {
        self.state.read().await.organization_id
    }

    /// Send a link project message to the hive.
    pub async fn send_link_project(&self, link: LinkProjectMessage) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::LinkProject(link))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Send an unlink project message to the hive.
    pub async fn send_unlink_project(
        &self,
        unlink: UnlinkProjectMessage,
    ) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::UnlinkProject(unlink))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }
}

/// Handle for interacting with a running node runner.
pub struct NodeRunnerHandle {
    /// Receiver for events from the hive
    pub event_rx: mpsc::Receiver<HiveEvent>,
    /// Sender for commands to the hive
    pub command_tx: mpsc::Sender<NodeMessage>,
    /// Shared state
    pub state: Arc<RwLock<NodeRunnerState>>,
    /// Join handle for the connection task
    _join_handle: tokio::task::JoinHandle<()>,
}

impl NodeRunnerHandle {
    /// Process events from the hive.
    ///
    /// This should be called in a loop to handle incoming events.
    pub async fn process_event(&mut self) -> Option<HiveEvent> {
        let event = self.event_rx.recv().await?;

        match &event {
            HiveEvent::Connected {
                node_id,
                organization_id,
                linked_projects,
                swarm_labels,
            } => {
                let mut state = self.state.write().await;
                state.node_id = Some(*node_id);
                state.organization_id = Some(*organization_id);
                state
                    .project_mapping
                    .update_from_links(linked_projects.clone());
                state.connected = true;

                tracing::info!(
                    node_id = %node_id,
                    organization_id = %organization_id,
                    project_count = linked_projects.len(),
                    swarm_labels_count = swarm_labels.len(),
                    "connected to hive"
                );
            }
            HiveEvent::Disconnected { reason } => {
                let mut state = self.state.write().await;
                state.connected = false;
                tracing::warn!(reason = %reason, "disconnected from hive");
            }
            HiveEvent::ProjectSync(sync) => {
                let mut state = self.state.write().await;
                if sync.is_new {
                    // Add the remote project link
                    state.project_mapping.add_remote_project(RemoteProjectInfo {
                        link_id: sync.link_id,
                        project_id: sync.project_id,
                        project_name: sync.project_name.clone(),
                        local_project_id: sync.local_project_id,
                        git_repo_path: sync.git_repo_path.clone(),
                        default_branch: sync.default_branch.clone(),
                        source_node_id: sync.source_node_id,
                        source_node_name: sync.source_node_name.clone(),
                        source_node_public_url: sync.source_node_public_url.clone(),
                    });
                    tracing::info!(
                        link_id = %sync.link_id,
                        project_id = %sync.project_id,
                        project_name = %sync.project_name,
                        source_node = %sync.source_node_name,
                        "remote project added"
                    );
                } else {
                    // Remove the remote project link
                    state.project_mapping.remove_remote_project(sync.link_id);
                    tracing::info!(
                        link_id = %sync.link_id,
                        project_id = %sync.project_id,
                        project_name = %sync.project_name,
                        source_node = %sync.source_node_name,
                        "remote project removed"
                    );
                }
            }
            HiveEvent::NodeRemoved(removed) => {
                let mut state = self.state.write().await;
                // Remove all projects from the removed node
                state
                    .project_mapping
                    .remove_projects_from_node(removed.node_id);
                tracing::info!(
                    node_id = %removed.node_id,
                    reason = %removed.reason,
                    "node removed from organization, cleaned up its projects"
                );
            }
            HiveEvent::TaskAssigned(assignment) => {
                tracing::info!(
                    assignment_id = %assignment.assignment_id,
                    task_id = %assignment.task_id,
                    "task assignment received"
                );
                // Track the assignment
                let mut state = self.state.write().await;
                state.active_assignments.insert(
                    assignment.assignment_id,
                    ActiveAssignment {
                        assignment_id: assignment.assignment_id,
                        task_id: assignment.task_id,
                        local_task_id: None,
                        local_attempt_id: None,
                        status: TaskExecutionStatus::Pending,
                    },
                );
            }
            HiveEvent::TaskCancelled(cancel) => {
                tracing::info!(
                    assignment_id = %cancel.assignment_id,
                    "task cancellation received"
                );
                let mut state = self.state.write().await;
                if let Some(assignment) = state.active_assignments.get_mut(&cancel.assignment_id) {
                    assignment.status = TaskExecutionStatus::Cancelled;
                }
            }
            HiveEvent::Error { message } => {
                tracing::error!(message = %message, "error from hive");
            }
            HiveEvent::TaskSyncResponse(response) => {
                if response.success {
                    tracing::info!(
                        local_task_id = %response.local_task_id,
                        shared_task_id = %response.shared_task_id,
                        "task sync response received - task will be updated"
                    );
                } else {
                    tracing::warn!(
                        local_task_id = %response.local_task_id,
                        error = ?response.error,
                        "task sync failed"
                    );
                }
                // Note: DB update happens in run_node_runner where we have access to the pool
            }
            HiveEvent::LabelSync(label_sync) => {
                tracing::info!(
                    shared_label_id = %label_sync.shared_label_id,
                    origin_node_id = %label_sync.origin_node_id,
                    name = %label_sync.name,
                    is_deleted = label_sync.is_deleted,
                    "label sync received from another node"
                );
                // Note: DB update for label sync should happen in run_node_runner
                // where we have access to the pool, or in a dedicated label sync handler
            }
            HiveEvent::BackfillRequest(request) => {
                tracing::info!(
                    message_id = %request.message_id,
                    backfill_type = ?request.backfill_type,
                    entity_count = request.entity_ids.len(),
                    "backfill request received from hive"
                );
                // Note: Backfill handling should happen in run_node_runner where we have
                // access to the database pool to query local data and send it to the hive.
            }
        }

        Some(event)
    }

    /// Send a task status update.
    pub async fn send_task_status(&self, status: TaskStatusMessage) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::TaskStatus(status))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Send task output/logs to the hive.
    pub async fn send_task_output(
        &self,
        output: super::hive_client::TaskOutputMessage,
    ) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::TaskOutput(output))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Send task progress event to the hive.
    pub async fn send_task_progress(
        &self,
        progress: super::hive_client::TaskProgressMessage,
    ) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::TaskProgress(progress))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Link a project to the hive.
    ///
    /// This notifies the hive that a local project is now linked to a remote project,
    /// allowing the hive to track which projects are available on which nodes.
    pub async fn send_link_project(&self, link: LinkProjectMessage) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::LinkProject(link))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Unlink a project from the hive.
    ///
    /// This notifies the hive that a local project is no longer linked to a remote project.
    pub async fn send_unlink_project(
        &self,
        unlink: UnlinkProjectMessage,
    ) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::UnlinkProject(unlink))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Sync a task attempt to the Hive.
    pub async fn send_attempt_sync(
        &self,
        attempt: AttemptSyncMessage,
    ) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::AttemptSync(attempt))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Sync an execution process to the Hive.
    pub async fn send_execution_sync(
        &self,
        execution: ExecutionSyncMessage,
    ) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::ExecutionSync(execution))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Sync a batch of log entries to the Hive.
    pub async fn send_logs_batch(&self, logs: LogsBatchMessage) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::LogsBatch(logs))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Check if connected to the hive.
    pub async fn is_connected(&self) -> bool {
        self.state.read().await.connected
    }
}

/// Errors from the node runner.
#[derive(Debug, thiserror::Error)]
pub enum NodeRunnerError {
    #[error("hive client error: {0}")]
    HiveClient(#[from] HiveClientError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("project not linked: {0}")]
    ProjectNotLinked(Uuid),
    #[error("assignment not found: {0}")]
    AssignmentNotFound(Uuid),
    #[error("remote client error: {0}")]
    RemoteClient(#[from] RemoteClientError),
    #[error("sync error: {0}")]
    SyncError(String),
}

/// Spawn the node runner and return a handle.
fn spawn_hive_connection(config: NodeRunnerConfig) -> NodeRunnerHandle {
    let capabilities = detect_capabilities();

    let hive_config = HiveClientConfig {
        hive_url: config.hive_url.clone(),
        api_key: config.api_key.clone(),
        node_name: config.node_name.clone(),
        machine_id: get_machine_id(),
        capabilities,
        public_url: config.public_url.clone(),
    };

    let (client, event_rx, command_tx, command_rx) = HiveClient::new(hive_config);

    // Spawn the connection loop
    let join_handle = tokio::spawn(async move {
        client.run(command_rx).await;
    });

    NodeRunnerHandle {
        event_rx,
        command_tx,
        state: Arc::new(RwLock::new(NodeRunnerState::default())),
        _join_handle: join_handle,
    }
}

use super::assignment_handler::AssignmentHandler;
use super::container::ContainerService;
use super::hive_sync::spawn_hive_sync_service;

/// Spawn the node runner event loop.
///
/// This function should be called during application startup if node mode is enabled.
/// It spawns a background task that:
/// 1. Connects to the hive server
/// 2. Processes incoming events (task assignments, cancellations, etc.)
/// 3. Creates local tasks and attempts for incoming assignments
/// 4. Syncs remote projects and tasks on connection (if remote_client provided)
///
/// Returns a `NodeRunnerContext` that can be used to interact with the hive.
///
/// Note: The container service must be passed in to enable task execution.
/// If container is None, task assignments will be logged but not executed.
pub fn spawn_node_runner<C: ContainerService + Sync + Send + 'static>(
    config: NodeRunnerConfig,
    db: DBService,
    container: Option<C>,
    remote_client: Option<RemoteClient>,
) -> Option<NodeRunnerContext> {
    let mut handle = spawn_hive_connection(config);
    let state = handle.state.clone();
    let command_tx = handle.command_tx.clone();

    // Create the context to return
    let context = NodeRunnerContext {
        state: state.clone(),
        command_tx: command_tx.clone(),
    };

    // Spawn the Hive sync service for syncing attempts, executions, and logs
    let _sync_handle = spawn_hive_sync_service(db.pool.clone(), command_tx.clone(), None);

    tokio::spawn(async move {
        // Create assignment handler if container is available
        let handler: Option<AssignmentHandler<C>> = container.map(|c| {
            AssignmentHandler::new(db.clone(), c, handle.state.clone(), command_tx.clone())
        });

        loop {
            match handle.process_event().await {
                Some(HiveEvent::Connected {
                    node_id,
                    organization_id,
                    linked_projects,
                    swarm_labels,
                }) => {
                    // Sync remote projects into unified schema on connect
                    if let Some(ref client) = remote_client
                        && let Err(e) =
                            sync_remote_projects(&db.pool, client, organization_id, node_id).await
                    {
                        tracing::warn!(error = ?e, "Failed to sync remote projects on connect");
                    }

                    // Sync remote_project_id for owned projects from hive
                    match sync_owned_project_ids_from_hive(&db.pool, &linked_projects).await {
                        Ok(count) if count > 0 => {
                            tracing::info!(
                                count,
                                "Synced remote_project_id from hive for owned projects"
                            );
                        }
                        Ok(_) => {}
                        Err(e) => {
                            tracing::warn!(error = ?e, "Failed to sync owned project IDs from hive");
                        }
                    }

                    // Auto-link local projects that have remote_project_id but aren't registered with hive
                    if let Err(e) =
                        auto_link_local_projects(&db.pool, &command_tx, &linked_projects).await
                    {
                        tracing::warn!(error = ?e, "Failed to auto-link local projects");
                    }

                    // Sync swarm labels from hive to local database
                    if let Err(e) = sync_swarm_labels(&db.pool, &swarm_labels).await {
                        tracing::warn!(error = ?e, "Failed to sync swarm labels from hive");
                    } else {
                        tracing::info!(
                            label_count = swarm_labels.len(),
                            "Synced swarm labels from hive"
                        );
                    }

                    // Sync node statuses from hive for remote projects
                    // This ensures source_node_status is up-to-date and not stale
                    if let Some(ref client) = remote_client
                        && let Err(e) = sync_node_statuses(&db.pool, client).await
                    {
                        tracing::warn!(error = ?e, "Failed to sync node statuses from hive");
                    }
                }
                Some(HiveEvent::TaskAssigned(assignment)) => {
                    tracing::info!(
                        assignment_id = %assignment.assignment_id,
                        task_id = %assignment.task_id,
                        title = %assignment.task.title,
                        "task assignment received"
                    );

                    if let Some(ref h) = handler {
                        if let Err(e) = h.handle_assignment(assignment).await {
                            tracing::error!(
                                error = %e,
                                "failed to handle task assignment"
                            );
                        }
                    } else {
                        tracing::warn!("task assignment received but no container available");
                    }
                }
                Some(HiveEvent::TaskCancelled(cancel)) => {
                    tracing::info!(
                        assignment_id = %cancel.assignment_id,
                        "task cancellation received"
                    );

                    if let Some(ref h) = handler {
                        if let Err(e) = h.handle_cancellation(cancel.assignment_id).await {
                            tracing::error!(
                                error = %e,
                                "failed to handle task cancellation"
                            );
                        }
                    } else {
                        tracing::warn!("task cancellation received but no container available");
                    }
                }
                Some(HiveEvent::TaskSyncResponse(response)) => {
                    if response.success {
                        // Update the local task with the shared_task_id
                        match Task::set_shared_task_id(
                            &db.pool,
                            response.local_task_id,
                            Some(response.shared_task_id),
                        )
                        .await
                        {
                            Ok(true) => {
                                tracing::info!(
                                    local_task_id = %response.local_task_id,
                                    shared_task_id = %response.shared_task_id,
                                    "updated local task with shared_task_id"
                                );
                                // Reset attempt sync status so attempts get re-synced with the correct shared_task_id
                                match TaskAttempt::clear_hive_sync_for_task(
                                    &db.pool,
                                    response.local_task_id,
                                )
                                .await
                                {
                                    Ok(count) if count > 0 => {
                                        tracing::info!(
                                            local_task_id = %response.local_task_id,
                                            count = count,
                                            "reset hive sync status for task attempts (will re-sync with correct shared_task_id)"
                                        );
                                    }
                                    Ok(_) => {} // No attempts to reset
                                    Err(e) => {
                                        tracing::warn!(
                                            error = ?e,
                                            local_task_id = %response.local_task_id,
                                            "failed to reset attempt sync status"
                                        );
                                    }
                                }
                            }
                            Ok(false) => {
                                tracing::warn!(
                                    local_task_id = %response.local_task_id,
                                    shared_task_id = %response.shared_task_id,
                                    "skipped setting shared_task_id (already set or conflict)"
                                );
                            }
                            Err(e) => {
                                tracing::error!(
                                    error = ?e,
                                    local_task_id = %response.local_task_id,
                                    shared_task_id = %response.shared_task_id,
                                    "failed to update task with shared_task_id"
                                );
                            }
                        }
                    }
                }
                Some(HiveEvent::LabelSync(label_sync)) => {
                    // Handle label sync broadcast from hive
                    if label_sync.is_deleted {
                        // Delete the local label if it exists
                        if let Some(label) =
                            Label::find_by_shared_label_id(&db.pool, label_sync.shared_label_id)
                                .await
                                .ok()
                                .flatten()
                        {
                            if let Err(e) = Label::delete(&db.pool, label.id).await {
                                tracing::warn!(
                                    error = ?e,
                                    shared_label_id = %label_sync.shared_label_id,
                                    "Failed to delete label from hive sync"
                                );
                            } else {
                                tracing::info!(
                                    shared_label_id = %label_sync.shared_label_id,
                                    name = %label_sync.name,
                                    "Deleted label from hive sync"
                                );
                            }
                        }
                    } else {
                        // Create or update the label
                        if let Err(e) = upsert_swarm_label(&db.pool, &label_sync).await {
                            tracing::warn!(
                                error = ?e,
                                shared_label_id = %label_sync.shared_label_id,
                                "Failed to upsert label from hive sync"
                            );
                        } else {
                            tracing::info!(
                                shared_label_id = %label_sync.shared_label_id,
                                name = %label_sync.name,
                                "Upserted label from hive sync"
                            );
                        }
                    }
                }
                Some(HiveEvent::BackfillRequest(request)) => {
                    // Handle backfill request from hive
                    tracing::info!(
                        message_id = %request.message_id,
                        backfill_type = ?request.backfill_type,
                        entity_count = request.entity_ids.len(),
                        "Processing backfill request from hive"
                    );

                    let mut entities_sent = 0u32;
                    let mut errors = Vec::new();

                    // Process each entity ID (attempt IDs for FullAttempt backfill)
                    for entity_id in &request.entity_ids {
                        match handle_backfill_attempt(
                            &db.pool,
                            &command_tx,
                            *entity_id,
                            &request.backfill_type,
                            request.logs_after,
                        )
                        .await
                        {
                            Ok(count) => {
                                entities_sent += count;
                            }
                            Err(e) => {
                                tracing::warn!(
                                    entity_id = %entity_id,
                                    error = ?e,
                                    "Failed to backfill entity"
                                );
                                errors.push(format!("{}: {}", entity_id, e));
                            }
                        }
                    }

                    // Send backfill response
                    let response = super::hive_client::BackfillResponseMessage {
                        request_id: request.message_id,
                        success: errors.is_empty(),
                        error: if errors.is_empty() {
                            None
                        } else {
                            Some(errors.join("; "))
                        },
                        entities_sent,
                    };

                    if let Err(e) = command_tx
                        .send(super::hive_client::NodeMessage::BackfillResponse(response))
                        .await
                    {
                        tracing::error!(
                            error = ?e,
                            message_id = %request.message_id,
                            "Failed to send backfill response"
                        );
                    } else {
                        tracing::info!(
                            message_id = %request.message_id,
                            entities_sent = entities_sent,
                            "Sent backfill response to hive"
                        );
                    }
                }
                Some(_) => {
                    // Other events are handled in process_event
                }
                None => {
                    // Channel closed, exit the loop
                    tracing::warn!("node runner event channel closed");
                    break;
                }
            }
        }
    });

    Some(context)
}

/// Sync remote projects and their tasks into the unified schema.
///
/// This function is called when the node connects to the hive to ensure
/// the local database has an up-to-date view of projects from other nodes.
async fn sync_remote_projects(
    pool: &SqlitePool,
    remote_client: &RemoteClient,
    organization_id: Uuid,
    current_node_id: Uuid,
) -> Result<(), NodeRunnerError> {
    // 1. Sync organization from hive - this directly upserts remote projects into unified Project table
    // Pass current_node_id to skip syncing our own projects as remote entries (they're local)
    if let Err(e) =
        node_cache::sync_organization(pool, remote_client, organization_id, Some(current_node_id))
            .await
    {
        tracing::warn!(error = ?e, "Failed to sync organization from hive");
    }

    // 2. Get remote projects from unified table (excluding current node)
    let remote_projects: Vec<_> = Project::find_remote_projects(pool)
        .await?
        .into_iter()
        .filter(|p| p.source_node_id != Some(current_node_id))
        .collect();

    // 3. Sync tasks for each remote project
    for project in &remote_projects {
        if let Some(remote_project_id) = project.remote_project_id
            && let Err(e) =
                sync_remote_project_tasks(pool, remote_client, project.id, remote_project_id).await
        {
            tracing::warn!(
                error = ?e,
                project_id = %remote_project_id,
                "Failed to sync tasks for remote project"
            );
        }
    }

    tracing::info!(
        project_count = remote_projects.len(),
        "Synced remote projects to unified schema"
    );

    Ok(())
}

/// Sync tasks for a single remote project from the Hive.
async fn sync_remote_project_tasks(
    pool: &SqlitePool,
    remote_client: &RemoteClient,
    local_project_id: Uuid,
    remote_project_id: Uuid,
) -> Result<(), NodeRunnerError> {
    // Fetch all tasks from Hive
    let snapshot = remote_client
        .fetch_bulk_snapshot(remote_project_id)
        .await
        .map_err(|e| NodeRunnerError::SyncError(e.to_string()))?;

    // Upsert each task
    let mut active_task_ids = Vec::new();
    for task_payload in snapshot.tasks {
        let task = &task_payload.task;
        let user = &task_payload.user;

        // Combine first_name and last_name into a display name
        let user_display_name = user.as_ref().map(|u| match (&u.first_name, &u.last_name) {
            (Some(first), Some(last)) => format!("{} {}", first, last),
            (Some(first), None) => first.clone(),
            (None, Some(last)) => last.clone(),
            (None, None) => String::new(),
        });

        Task::upsert_remote_task(
            pool,
            Uuid::new_v4(),
            local_project_id,
            task.id,
            task.title.clone(),
            task.description.clone(),
            convert_task_status(&task.status),
            task.assignee_user_id,
            user_display_name,
            user.as_ref().and_then(|u| u.username.clone()),
            task.version,
            Some(task.updated_at), // Use updated_at as activity_at for bulk sync
            task.archived_at,
        )
        .await?;

        active_task_ids.push(task.id);
    }

    // Handle deleted tasks
    for deleted_id in snapshot.deleted_task_ids {
        Task::delete_by_shared_task_id(pool, deleted_id).await?;
    }

    // Clean up stale shared tasks for this project
    if !active_task_ids.is_empty() {
        Task::delete_stale_shared_tasks(pool, local_project_id, &active_task_ids).await?;
    }

    Ok(())
}

/// Convert remote TaskStatus to local TaskStatus.
fn convert_task_status(status: &RemoteTaskStatus) -> TaskStatus {
    match status {
        RemoteTaskStatus::Todo => TaskStatus::Todo,
        RemoteTaskStatus::InProgress => TaskStatus::InProgress,
        RemoteTaskStatus::InReview => TaskStatus::InReview,
        RemoteTaskStatus::Done => TaskStatus::Done,
        RemoteTaskStatus::Cancelled => TaskStatus::Cancelled,
    }
}

/// Auto-link all local projects that have remote_project_id but aren't registered with hive.
///
/// This function is called on connection to ensure all previously-linked projects
/// are properly registered with the hive. This handles the case where projects were
/// linked before the node joined the hive, or if the hive's node_projects table was reset.
async fn auto_link_local_projects(
    pool: &SqlitePool,
    command_tx: &mpsc::Sender<NodeMessage>,
    linked_projects: &[LinkedProjectInfo],
) -> Result<(), NodeRunnerError> {
    // Get all local projects with remote_project_id set
    let local_projects = Project::find_all_with_remote_id(pool).await?;

    let mut linked_count = 0;
    for project in local_projects {
        let remote_project_id = match project.remote_project_id {
            Some(id) => id,
            None => continue,
        };

        // Check if already registered with hive (is_owned == true for this project)
        // We match on local_project_id because that's the unique identifier on this node
        let already_linked = linked_projects
            .iter()
            .any(|lp| lp.is_owned && lp.local_project_id == project.id);

        if !already_linked {
            let link_msg = LinkProjectMessage {
                project_id: remote_project_id,
                local_project_id: project.id,
                git_repo_path: project.git_repo_path.to_string_lossy().to_string(),
                default_branch: "main".to_string(), // Default to main
            };

            command_tx
                .send(NodeMessage::LinkProject(link_msg))
                .await
                .map_err(|_| {
                    NodeRunnerError::SyncError("Failed to send LinkProject".to_string())
                })?;

            linked_count += 1;
            tracing::info!(
                project_id = %project.id,
                remote_project_id = %remote_project_id,
                name = %project.name,
                "Auto-linked project to hive"
            );
        }
    }

    if linked_count > 0 {
        tracing::info!(linked_count, "Auto-linked local projects to hive");
    }

    Ok(())
}

/// Sync remote_project_id for owned projects from hive auth response.
///
/// When a node connects, the hive sends linked_projects with swarm_project_id
/// for each project this node owns. This updates local projects to set
/// remote_project_id accordingly, enabling by-remote-id proxy requests.
async fn sync_owned_project_ids_from_hive(
    pool: &SqlitePool,
    linked_projects: &[LinkedProjectInfo],
) -> Result<usize, NodeRunnerError> {
    let mut updated_count = 0;

    for project_info in linked_projects {
        if !project_info.is_owned {
            continue;
        }

        let local_project = match Project::find_by_id(pool, project_info.local_project_id).await? {
            Some(p) => p,
            None => {
                tracing::warn!(
                    local_project_id = %project_info.local_project_id,
                    "Owned project not found locally"
                );
                continue;
            }
        };

        let needs_update = local_project
            .remote_project_id
            .map(|id| id != project_info.project_id)
            .unwrap_or(true);

        if needs_update {
            Project::set_remote_project_id(
                pool,
                project_info.local_project_id,
                Some(project_info.project_id),
            )
            .await?;

            tracing::info!(
                local_project_id = %project_info.local_project_id,
                remote_project_id = %project_info.project_id,
                project_name = %local_project.name,
                "Synced remote_project_id from hive"
            );
            updated_count += 1;
        }
    }

    Ok(updated_count)
}

/// Sync swarm labels from hive to local database.
///
/// This is called on connection to populate the local label cache with
/// organization-global labels from the hive. These labels are used for
/// tasks in swarm-connected projects.
///
/// To avoid duplicates, we check:
/// 1. First by shared_label_id (already linked labels)
/// 2. Then by name for org-global labels (to link default labels created at migration)
async fn sync_swarm_labels(
    pool: &SqlitePool,
    swarm_labels: &[SwarmLabelInfo],
) -> Result<(), NodeRunnerError> {
    for label_info in swarm_labels {
        // Check if we already have this label by shared_label_id
        let existing = Label::find_by_shared_label_id(pool, label_info.id).await?;

        if let Some(existing) = existing {
            // Update if version is newer
            if label_info.version > existing.version {
                Label::update_from_hive(
                    pool,
                    existing.id,
                    &label_info.name,
                    &label_info.icon,
                    &label_info.color,
                    label_info.version,
                )
                .await?;
            }
        } else {
            // Check if there's a local org-global label with the same name but no shared_label_id
            // This handles default labels created during migration
            let existing_by_name = Label::find_global_by_name(pool, &label_info.name).await?;

            if let Some(existing) = existing_by_name {
                // Link existing local label to hive by setting shared_label_id
                Label::update_from_hive(
                    pool,
                    existing.id,
                    &label_info.name,
                    &label_info.icon,
                    &label_info.color,
                    label_info.version,
                )
                .await?;
                // Also set the shared_label_id to link it
                Label::set_shared_label_id(pool, existing.id, label_info.id).await?;
                tracing::info!(
                    label_name = %label_info.name,
                    shared_label_id = %label_info.id,
                    local_label_id = %existing.id,
                    "Linked existing local label to hive label"
                );
            } else {
                // Create new label from hive - swarm labels have project_id = None
                Label::create_from_hive(
                    pool,
                    label_info.id,
                    None, // Swarm labels are org-global (no project)
                    &label_info.name,
                    &label_info.icon,
                    &label_info.color,
                    label_info.version,
                )
                .await?;
            }
        }
    }

    Ok(())
}

/// Sync node statuses from hive for all remote projects.
///
/// This is called on connection to ensure source_node_status is up-to-date
/// and not stale. Without this sync, remote task attempts would fail with
/// "Remote node offline" errors even when the node is actually online.
async fn sync_node_statuses(
    pool: &SqlitePool,
    remote_client: &RemoteClient,
) -> Result<(), NodeRunnerError> {
    // Get all unique source node IDs from remote projects
    let source_node_ids = Project::get_remote_source_node_ids(pool).await?;

    if source_node_ids.is_empty() {
        return Ok(());
    }

    // Fetch current statuses from hive
    let response = remote_client
        .get_node_statuses(&source_node_ids)
        .await
        .map_err(|e| NodeRunnerError::SyncError(format!("Failed to fetch node statuses: {}", e)))?;

    // Update local projects with current statuses
    let mut updated_count = 0;
    for node_info in response.nodes {
        let rows_affected = Project::update_node_status_by_source_node_id(
            pool,
            node_info.id,
            &node_info.status,
            node_info.public_url.as_deref(),
        )
        .await?;

        if rows_affected > 0 {
            updated_count += rows_affected;
            tracing::debug!(
                node_id = %node_info.id,
                status = %node_info.status,
                public_url = ?node_info.public_url,
                "Updated source_node_status for remote projects"
            );
        }
    }

    if updated_count > 0 {
        tracing::info!(
            updated_count,
            node_count = source_node_ids.len(),
            "Synced node statuses from hive"
        );
    }

    Ok(())
}

/// Upsert a single swarm label from a broadcast message.
async fn upsert_swarm_label(
    pool: &SqlitePool,
    label_sync: &LabelSyncBroadcastMessage,
) -> Result<(), NodeRunnerError> {
    let existing = Label::find_by_shared_label_id(pool, label_sync.shared_label_id).await?;

    if let Some(existing) = existing {
        // Update if version is newer
        if label_sync.version > existing.version {
            Label::update_from_hive(
                pool,
                existing.id,
                &label_sync.name,
                &label_sync.icon,
                &label_sync.color,
                label_sync.version,
            )
            .await?;
        }
    } else {
        // Create new label from hive - use project_id from broadcast if available
        Label::create_from_hive(
            pool,
            label_sync.shared_label_id,
            label_sync.project_id, // May be None for swarm labels
            &label_sync.name,
            &label_sync.icon,
            &label_sync.color,
            label_sync.version,
        )
        .await?;
    }

    Ok(())
}

/// Build an ExecutionSyncMessage from an ExecutionProcess.
fn build_execution_sync_message(
    exec: &db::models::execution_process::ExecutionProcess,
) -> super::hive_client::ExecutionSyncMessage {
    super::hive_client::ExecutionSyncMessage {
        execution_id: exec.id,
        attempt_id: exec.task_attempt_id,
        run_reason: format!("{:?}", exec.run_reason).to_lowercase(),
        executor_action: Some(serde_json::to_value(&exec.executor_action).unwrap_or_default()),
        before_head_commit: exec.before_head_commit.clone(),
        after_head_commit: exec.after_head_commit.clone(),
        status: format!("{:?}", exec.status).to_lowercase(),
        exit_code: exec.exit_code.map(|c| c as i32),
        dropped: exec.dropped,
        pid: exec.pid,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        created_at: exec.created_at,
    }
}

/// Build a LogsBatchMessage from log entries for an execution.
///
/// # Arguments
/// * `logs` - The log entries to include
/// * `execution_id` - The execution process ID
/// * `assignment_id` - The assignment ID (may be attempt_id for locally-started tasks)
/// * `shared_task_id` - The shared task ID (enables synthetic assignment creation on hive)
fn build_logs_batch_message(
    logs: &[db::models::log_entry::DbLogEntry],
    execution_id: Uuid,
    assignment_id: Uuid,
    shared_task_id: Uuid,
) -> super::hive_client::LogsBatchMessage {
    use super::hive_client::{SyncLogEntry, TaskOutputType};

    let entries: Vec<SyncLogEntry> = logs
        .iter()
        .map(|log| SyncLogEntry {
            output_type: match log.output_type.as_str() {
                "stdout" => TaskOutputType::Stdout,
                "stderr" => TaskOutputType::Stderr,
                _ => TaskOutputType::System,
            },
            content: log.content.clone(),
            timestamp: log.timestamp,
        })
        .collect();

    super::hive_client::LogsBatchMessage {
        assignment_id,
        shared_task_id: Some(shared_task_id),
        execution_process_id: Some(execution_id),
        entries,
        compressed: false,
    }
}

/// Handle a backfill request for a single attempt.
///
/// This function queries the local database for the specified attempt and its associated
/// data (executions, logs) and sends sync messages to the Hive via the provided channel.
///
/// # Arguments
/// * `pool` - Database connection pool
/// * `command_tx` - Channel to send NodeMessage to the Hive
/// * `attempt_id` - The task attempt ID to backfill
/// * `backfill_type` - Type of data to backfill (FullAttempt, Executions, or Logs)
/// * `logs_after` - Optional timestamp filter for Logs backfill
///
/// # Returns
/// The count of entities processed/sent, or an error if the operation fails.
pub async fn handle_backfill_attempt(
    pool: &SqlitePool,
    command_tx: &mpsc::Sender<NodeMessage>,
    attempt_id: Uuid,
    backfill_type: &super::hive_client::BackfillType,
    logs_after: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<u32, NodeRunnerError> {
    use super::hive_client::{AttemptSyncMessage, BackfillType};
    use db::models::{
        execution_process::ExecutionProcess, log_entry::DbLogEntry, task::Task,
        task_attempt::TaskAttempt,
    };

    // Fetch the attempt
    let attempt = TaskAttempt::find_by_id(pool, attempt_id)
        .await?
        .ok_or_else(|| NodeRunnerError::SyncError(format!("attempt {} not found", attempt_id)))?;

    // Fetch the associated task
    let task = Task::find_by_id(pool, attempt.task_id)
        .await?
        .ok_or_else(|| NodeRunnerError::SyncError(format!("task {} not found", attempt.task_id)))?;

    // Get shared_task_id, required for sync. If the task has no shared_task_id,
    // it means the project is no longer linked to the hive (e.g., after a reset migration).
    // This is not an error - we just can't backfill this attempt.
    let Some(shared_task_id) = task.shared_task_id else {
        tracing::debug!(
            task_id = %task.id,
            attempt_id = %attempt_id,
            "skipping backfill: task has no shared_task_id (project not linked to hive)"
        );
        return Ok(0);
    };

    match backfill_type {
        BackfillType::FullAttempt => {
            // Send attempt sync
            let attempt_msg = AttemptSyncMessage {
                attempt_id: attempt.id,
                assignment_id: attempt.hive_assignment_id,
                shared_task_id,
                executor: attempt.executor.clone(),
                executor_variant: None,
                branch: attempt.branch.clone(),
                target_branch: attempt.target_branch.clone(),
                container_ref: attempt.container_ref.clone(),
                worktree_deleted: attempt.worktree_deleted,
                setup_completed_at: attempt.setup_completed_at,
                created_at: attempt.created_at,
                updated_at: attempt.updated_at,
            };
            command_tx
                .send(NodeMessage::AttemptSync(attempt_msg))
                .await
                .map_err(|e| NodeRunnerError::SyncError(e.to_string()))?;

            // Get all executions for this attempt
            let executions =
                ExecutionProcess::find_by_task_attempt_id(pool, attempt_id, false).await?;

            for exec in &executions {
                // Send execution sync
                let exec_msg = build_execution_sync_message(exec);
                command_tx
                    .send(NodeMessage::ExecutionSync(exec_msg))
                    .await
                    .map_err(|e| NodeRunnerError::SyncError(e.to_string()))?;

                // Get logs for this execution
                let logs = DbLogEntry::find_by_execution_id(pool, exec.id).await?;
                if !logs.is_empty() {
                    let logs_msg = build_logs_batch_message(
                        &logs,
                        exec.id,
                        attempt.hive_assignment_id.unwrap_or(attempt_id),
                        shared_task_id,
                    );
                    command_tx
                        .send(NodeMessage::LogsBatch(logs_msg))
                        .await
                        .map_err(|e| NodeRunnerError::SyncError(e.to_string()))?;
                }
            }
            Ok(1) // 1 attempt processed
        }
        BackfillType::Executions => {
            // Get all executions for this attempt and send only ExecutionSync messages
            let executions =
                ExecutionProcess::find_by_task_attempt_id(pool, attempt_id, false).await?;

            let mut count = 0u32;
            for exec in &executions {
                let exec_msg = build_execution_sync_message(exec);
                command_tx
                    .send(NodeMessage::ExecutionSync(exec_msg))
                    .await
                    .map_err(|e| NodeRunnerError::SyncError(e.to_string()))?;
                count += 1;
            }
            Ok(count)
        }
        BackfillType::Logs => {
            // Get all executions for this attempt
            let executions =
                ExecutionProcess::find_by_task_attempt_id(pool, attempt_id, false).await?;

            let mut count = 0u32;
            for exec in &executions {
                // Get logs for this execution, optionally filtered by timestamp
                let logs = if let Some(after_ts) = logs_after {
                    DbLogEntry::find_by_execution_id_after(pool, exec.id, after_ts).await?
                } else {
                    DbLogEntry::find_by_execution_id(pool, exec.id).await?
                };

                if !logs.is_empty() {
                    let logs_msg = build_logs_batch_message(
                        &logs,
                        exec.id,
                        attempt.hive_assignment_id.unwrap_or(attempt_id),
                        shared_task_id,
                    );
                    command_tx
                        .send(NodeMessage::LogsBatch(logs_msg))
                        .await
                        .map_err(|e| NodeRunnerError::SyncError(e.to_string()))?;
                    count += 1;
                }
            }
            Ok(count)
        }
    }
}

#[cfg(test)]
mod backfill_tests {
    use super::*;
    use db::models::{
        log_entry::{CreateLogEntry, DbLogEntry},
        project::{CreateProject, Project},
        task::{CreateTask, Task},
    };
    use tokio::sync::mpsc;

    /// Helper to create test data for backfill tests.
    /// Creates a project -> task -> attempt -> execution -> logs chain.
    async fn create_test_attempt_data(pool: &SqlitePool) -> (Uuid, Uuid, Uuid, Uuid) {
        // Create project
        let project_id = Uuid::new_v4();
        let project_data = CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: format!("/tmp/test-repo-{}", project_id),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let _project = Project::create(pool, &project_data, project_id)
            .await
            .expect("Failed to create project");

        // Create task with shared_task_id
        let task_id = Uuid::new_v4();
        let shared_task_id = Uuid::new_v4();
        let task_data = CreateTask::from_title_description(
            project_id,
            "Test Task".to_string(),
            Some("Test description".to_string()),
        );
        let _task = Task::create(pool, &task_data, task_id)
            .await
            .expect("Failed to create task");

        // Set shared_task_id
        Task::set_shared_task_id(pool, task_id, Some(shared_task_id))
            .await
            .expect("Failed to set shared_task_id");

        // Create task attempt
        let attempt_id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO task_attempts (id, task_id, executor, branch, target_branch)
               VALUES ($1, $2, 'CLAUDE_CODE', 'test-branch', 'main')"#,
        )
        .bind(attempt_id)
        .bind(task_id)
        .execute(pool)
        .await
        .expect("Failed to create task attempt");

        // Create execution process
        let execution_id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO execution_processes (id, task_attempt_id, status, run_reason, executor_action)
               VALUES ($1, $2, 'completed', 'codingagent', '{}')"#,
        )
        .bind(execution_id)
        .bind(attempt_id)
        .execute(pool)
        .await
        .expect("Failed to create execution process");

        // Create log entries
        for i in 0..3 {
            DbLogEntry::create(
                pool,
                CreateLogEntry {
                    execution_id,
                    output_type: "stdout".to_string(),
                    content: format!("Test log message {}", i),
                },
            )
            .await
            .expect("Failed to create log entry");
        }

        (project_id, task_id, attempt_id, execution_id)
    }

    #[tokio::test]
    async fn test_backfill_full_attempt_sends_all_messages() {
        use super::super::hive_client::BackfillType;

        // Setup: Create test pool with attempt, execution, logs
        let (pool, _temp) = db::test_utils::create_test_pool().await;
        let (tx, mut rx) = mpsc::channel::<NodeMessage>(10);

        // Create test data
        let (_project_id, _task_id, attempt_id, _execution_id) =
            create_test_attempt_data(&pool).await;

        // Act: Call handle_backfill_attempt
        let result =
            handle_backfill_attempt(&pool, &tx, attempt_id, &BackfillType::FullAttempt, None).await;

        // Assert: Should succeed and return 1 attempt processed
        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), 1);

        // Verify messages sent: AttemptSync, ExecutionSync, LogsBatch
        let msg1 = rx.recv().await.expect("Expected AttemptSync message");
        assert!(
            matches!(msg1, NodeMessage::AttemptSync(_)),
            "Expected AttemptSync, got {:?}",
            msg1
        );

        let msg2 = rx.recv().await.expect("Expected ExecutionSync message");
        assert!(
            matches!(msg2, NodeMessage::ExecutionSync(_)),
            "Expected ExecutionSync, got {:?}",
            msg2
        );

        let msg3 = rx.recv().await.expect("Expected LogsBatch message");
        assert!(
            matches!(msg3, NodeMessage::LogsBatch(_)),
            "Expected LogsBatch, got {:?}",
            msg3
        );
    }

    #[tokio::test]
    async fn test_backfill_missing_attempt_returns_error() {
        use super::super::hive_client::BackfillType;

        let (pool, _temp) = db::test_utils::create_test_pool().await;
        let (tx, _rx) = mpsc::channel::<NodeMessage>(10);

        // Try to backfill a non-existent attempt
        let fake_attempt_id = Uuid::new_v4();
        let result = handle_backfill_attempt(
            &pool,
            &tx,
            fake_attempt_id,
            &BackfillType::FullAttempt,
            None,
        )
        .await;

        // Should return an error
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.to_string().contains("not found"),
            "Expected 'not found' error, got: {}",
            err
        );
    }

    #[tokio::test]
    async fn test_backfill_attempt_without_shared_task_id_returns_ok_zero() {
        use super::super::hive_client::BackfillType;

        let (pool, _temp) = db::test_utils::create_test_pool().await;
        let (tx, _rx) = mpsc::channel::<NodeMessage>(10);

        // Create project and task without shared_task_id
        let project_id = Uuid::new_v4();
        let project_data = CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: format!("/tmp/test-repo-{}", project_id),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let _project = Project::create(&pool, &project_data, project_id)
            .await
            .expect("Failed to create project");

        let task_id = Uuid::new_v4();
        let task_data =
            CreateTask::from_title_description(project_id, "Test Task".to_string(), None);
        let _task = Task::create(&pool, &task_data, task_id)
            .await
            .expect("Failed to create task");
        // Note: NOT setting shared_task_id

        let attempt_id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO task_attempts (id, task_id, executor, branch, target_branch)
               VALUES ($1, $2, 'CLAUDE_CODE', 'test-branch', 'main')"#,
        )
        .bind(attempt_id)
        .bind(task_id)
        .execute(&pool)
        .await
        .expect("Failed to create task attempt");

        // Try to backfill - should succeed but return 0 (graceful skip)
        // This allows the hive to mark the backfill request as complete and stop retrying
        let result =
            handle_backfill_attempt(&pool, &tx, attempt_id, &BackfillType::FullAttempt, None).await;

        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(
            result.unwrap(),
            0,
            "Should return 0 when task has no shared_task_id (graceful skip)"
        );
    }

    #[tokio::test]
    async fn test_backfill_executions_only() {
        use super::super::hive_client::BackfillType;

        // Setup: Create test pool with attempt, execution, logs
        let (pool, _temp) = db::test_utils::create_test_pool().await;
        let (tx, mut rx) = mpsc::channel::<NodeMessage>(10);

        // Create test data with 2 executions
        let (_, _, attempt_id, _) = create_test_attempt_data(&pool).await;

        // Add a second execution
        let execution_id_2 = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO execution_processes (id, task_attempt_id, status, run_reason, executor_action)
               VALUES ($1, $2, 'completed', 'codingagent', '{}')"#,
        )
        .bind(execution_id_2)
        .bind(attempt_id)
        .execute(&pool)
        .await
        .expect("Failed to create second execution process");

        // Act: Call handle_backfill_attempt with BackfillType::Executions
        let result =
            handle_backfill_attempt(&pool, &tx, attempt_id, &BackfillType::Executions, None).await;

        // Assert: Should succeed and return 2 executions processed
        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), 2, "Should have processed 2 executions");

        // Verify only ExecutionSync messages sent (no AttemptSync, no LogsBatch)
        let msg1 = rx
            .recv()
            .await
            .expect("Expected first ExecutionSync message");
        assert!(
            matches!(msg1, NodeMessage::ExecutionSync(_)),
            "Expected ExecutionSync, got {:?}",
            msg1
        );

        let msg2 = rx
            .recv()
            .await
            .expect("Expected second ExecutionSync message");
        assert!(
            matches!(msg2, NodeMessage::ExecutionSync(_)),
            "Expected ExecutionSync, got {:?}",
            msg2
        );

        // Channel should be empty - no more messages
        assert!(
            rx.try_recv().is_err(),
            "Expected no more messages after ExecutionSync"
        );
    }

    #[tokio::test]
    async fn test_backfill_logs_only() {
        use super::super::hive_client::BackfillType;

        // Setup: Create test pool with attempt, execution, logs
        let (pool, _temp) = db::test_utils::create_test_pool().await;
        let (tx, mut rx) = mpsc::channel::<NodeMessage>(10);

        // Create test data (includes 3 logs)
        let (_, _, attempt_id, _) = create_test_attempt_data(&pool).await;

        // Act: Call handle_backfill_attempt with BackfillType::Logs
        let result =
            handle_backfill_attempt(&pool, &tx, attempt_id, &BackfillType::Logs, None).await;

        // Assert: Should succeed and return 1 (one execution with logs)
        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(
            result.unwrap(),
            1,
            "Should have processed 1 execution's logs"
        );

        // Verify only LogsBatch message sent
        let msg = rx.recv().await.expect("Expected LogsBatch message");
        match msg {
            NodeMessage::LogsBatch(logs_msg) => {
                assert_eq!(logs_msg.entries.len(), 3, "Should have 3 log entries");
            }
            _ => panic!("Expected LogsBatch, got {:?}", msg),
        }

        // Channel should be empty - no AttemptSync or ExecutionSync
        assert!(
            rx.try_recv().is_err(),
            "Expected no more messages after LogsBatch"
        );
    }

    #[tokio::test]
    async fn test_backfill_logs_with_timestamp_filter() {
        use super::super::hive_client::BackfillType;
        use chrono::Duration;

        // Setup: Create test pool
        let (pool, _temp) = db::test_utils::create_test_pool().await;
        let (tx, mut rx) = mpsc::channel::<NodeMessage>(10);

        // Create test data (includes 3 logs)
        let (_, _, attempt_id, execution_id) = create_test_attempt_data(&pool).await;

        // Get all logs to find the latest timestamp
        let all_logs = DbLogEntry::find_by_execution_id(&pool, execution_id)
            .await
            .expect("Failed to get logs");

        // Use a cutoff time that is definitely after all existing logs
        // We take the max timestamp and add 1 second to be safe
        let max_timestamp = all_logs.iter().map(|l| l.timestamp).max().unwrap();
        let cutoff_time = max_timestamp + Duration::seconds(1);

        // Add one more log entry after the cutoff (this will have timestamp > cutoff)
        // We need to wait a bit so the new log's timestamp is after our cutoff
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        DbLogEntry::create(
            &pool,
            CreateLogEntry {
                execution_id,
                output_type: "stdout".to_string(),
                content: "New log after cutoff".to_string(),
            },
        )
        .await
        .expect("Failed to create new log entry");

        // Act: Call handle_backfill_attempt with logs_after filter
        let result = handle_backfill_attempt(
            &pool,
            &tx,
            attempt_id,
            &BackfillType::Logs,
            Some(cutoff_time),
        )
        .await;

        // Assert: Should succeed
        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
        assert_eq!(
            result.unwrap(),
            1,
            "Should have processed 1 execution's logs"
        );

        // Verify LogsBatch only contains the new log
        let msg = rx.recv().await.expect("Expected LogsBatch message");
        match msg {
            NodeMessage::LogsBatch(logs_msg) => {
                assert_eq!(
                    logs_msg.entries.len(),
                    1,
                    "Should only have 1 log entry (after cutoff)"
                );
                assert_eq!(
                    logs_msg.entries[0].content, "New log after cutoff",
                    "Should be the new log entry"
                );
            }
            _ => panic!("Expected LogsBatch, got {:?}", msg),
        }
    }
}
