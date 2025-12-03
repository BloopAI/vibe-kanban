//! Node runner for local deployments to connect to a remote hive.
//!
//! This module provides the integration between a local Vibe Kanban instance
//! and a remote hive server, allowing the local instance to receive and execute
//! tasks dispatched from the hive.

use std::collections::HashMap;
use std::sync::Arc;

use db::DBService;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

use super::hive_client::{
    HiveClient, HiveClientConfig, HiveClientError, HiveEvent, LinkedProjectInfo, NodeMessage,
    TaskExecutionStatus, TaskStatusMessage, detect_capabilities, get_machine_id,
};

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

/// Mapping from hive project links to local project IDs.
#[derive(Debug, Clone, Default)]
pub struct ProjectMapping {
    /// Maps link_id -> local project info
    links: HashMap<Uuid, LinkedProjectInfo>,
    /// Maps local_project_id -> link_id
    local_to_link: HashMap<Uuid, Uuid>,
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
                state.project_mapping.add_link(LinkedProjectInfo {
                    link_id: sync.link_id,
                    project_id: sync.project_id,
                    local_project_id: sync.local_project_id,
                    git_repo_path: sync.git_repo_path.clone(),
                    default_branch: sync.default_branch.clone(),
                });
                tracing::info!(
                    link_id = %sync.link_id,
                    project_id = %sync.project_id,
                    is_new = sync.is_new,
                    "project sync received"
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
///
/// Note: The container service must be passed in to enable task execution.
/// If container is None, task assignments will be logged but not executed.
pub fn spawn_node_runner<C: ContainerService + Sync + Send + 'static>(
    config: NodeRunnerConfig,
    db: DBService,
    container: Option<C>,
) -> Option<Arc<RwLock<NodeRunnerState>>> {
    let mut handle = spawn_hive_connection(config);
    let state = handle.state.clone();
    let command_tx = handle.command_tx.clone();

    tokio::spawn(async move {
        // Create assignment handler if container is available
        let handler: Option<AssignmentHandler<C>> = container.map(|c| {
            AssignmentHandler::new(db.clone(), c, handle.state.clone(), command_tx.clone())
        });

        loop {
            match handle.process_event().await {
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

    Some(state)
}
