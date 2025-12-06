//! Node runner for local deployments to connect to a remote hive.
//!
//! This module provides the integration between a local Vibe Kanban instance
//! and a remote hive server, allowing the local instance to receive and execute
//! tasks dispatched from the hive.

use std::collections::HashMap;
use std::sync::Arc;

use db::DBService;
use db::models::{project::Project, task::Task, task::TaskStatus};
use remote::db::tasks::TaskStatus as RemoteTaskStatus;
use sqlx::SqlitePool;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

use super::hive_client::{
    HiveClient, HiveClientConfig, HiveClientError, HiveEvent, LinkProjectMessage,
    LinkedProjectInfo, NodeMessage, TaskExecutionStatus, TaskStatusMessage, UnlinkProjectMessage,
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
        let hive_url = std::env::var("VK_HIVE_URL").ok()?;
        let api_key = std::env::var("VK_NODE_API_KEY").ok()?;

        let node_name = std::env::var("VK_NODE_NAME").unwrap_or_else(|_| {
            hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "vibe-kanban-node".to_string())
        });

        let public_url = std::env::var("VK_NODE_PUBLIC_URL").ok();

        let connection_token_secret = std::env::var("VK_CONNECTION_TOKEN_SECRET")
            .ok()
            .map(secrecy::SecretString::from);

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

    pub fn update_from_links(&mut self, links: Vec<LinkedProjectInfo>) {
        self.links.clear();
        self.local_to_link.clear();

        for link in links {
            self.local_to_link
                .insert(link.local_project_id, link.link_id);
            self.links.insert(link.link_id, link);
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
                state.project_mapping.remove_projects_from_node(removed.node_id);
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
                    ..
                }) => {
                    // Sync remote projects into unified schema on connect
                    if let Some(ref client) = remote_client
                        && let Err(e) =
                            sync_remote_projects(&db.pool, client, organization_id, node_id).await
                    {
                        tracing::warn!(error = ?e, "Failed to sync remote projects on connect");
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
    if let Err(e) = node_cache::sync_organization(pool, remote_client, organization_id).await {
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
        )
        .await?;

        active_task_ids.push(task.id);
    }

    // Handle deleted tasks
    for deleted_id in snapshot.deleted_task_ids {
        Task::delete_by_shared_task_id(pool, deleted_id).await?;
    }

    // Clean up stale remote tasks for this project
    if !active_task_ids.is_empty() {
        Task::delete_stale_remote_tasks(pool, local_project_id, &active_task_ids).await?;
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
