//! WebSocket session handler for node connections.
//!
//! This module handles the lifecycle of a single node WebSocket connection,
//! including authentication, message routing, and heartbeat management.

use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use chrono::Utc;
use futures::{SinkExt, StreamExt};
use sqlx::PgPool;
use tokio::{
    sync::mpsc,
    time::{self, MissedTickBehavior},
};
use tracing::{Span, instrument};
use uuid::Uuid;

use super::{
    connection::ConnectionManager,
    message::{
        AuthResultMessage, DeregisterMessage, HeartbeatMessage, HiveMessage, LinkProjectMessage,
        LinkedProjectInfo, NodeMessage, NodeRemovedMessage, ProjectSyncMessage, PROTOCOL_VERSION,
        TaskExecutionStatus, TaskOutputMessage, TaskProgressMessage, TaskStatusMessage,
        UnlinkProjectMessage,
    },
};
use crate::nodes::{
    domain::NodeStatus,
    service::{NodeServiceImpl, RegisterNode},
};

/// Heartbeat timeout - close connection if no heartbeat received.
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(90);

/// Channel buffer size for outgoing messages.
const OUTGOING_BUFFER_SIZE: usize = 64;

/// Handle a new node WebSocket connection.
#[instrument(
    name = "node_ws.session",
    skip(socket, pool, connections),
    fields(
        node_id = tracing::field::Empty,
        org_id = tracing::field::Empty,
        machine_id = tracing::field::Empty
    )
)]
pub async fn handle(socket: WebSocket, pool: PgPool, connections: ConnectionManager) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::channel::<HiveMessage>(OUTGOING_BUFFER_SIZE);

    // Wait for authentication message
    let auth_result = match wait_for_auth(&mut ws_receiver, &pool).await {
        Ok(result) => result,
        Err(error) => {
            tracing::info!(?error, "node authentication failed");
            let _ = send_message(
                &mut ws_sender,
                &HiveMessage::AuthResult(AuthResultMessage {
                    success: false,
                    node_id: None,
                    organization_id: None,
                    error: Some(error.to_string()),
                    protocol_version: PROTOCOL_VERSION,
                    linked_projects: vec![],
                }),
            )
            .await;
            return;
        }
    };

    // Record context in span
    Span::current().record("node_id", format_args!("{}", auth_result.node_id));
    Span::current().record("org_id", format_args!("{}", auth_result.organization_id));

    // Clone projects for broadcast before moving into response
    let projects_for_broadcast = auth_result.linked_projects.clone();

    // Send auth success response
    if send_message(
        &mut ws_sender,
        &HiveMessage::AuthResult(AuthResultMessage {
            success: true,
            node_id: Some(auth_result.node_id),
            organization_id: Some(auth_result.organization_id),
            error: None,
            protocol_version: PROTOCOL_VERSION,
            linked_projects: auth_result.linked_projects,
        }),
    )
    .await
    .is_err()
    {
        return;
    }

    // Register connection
    connections
        .register(auth_result.node_id, auth_result.organization_id, tx)
        .await;

    // Broadcast this node's projects to other nodes in the organization
    broadcast_node_projects(
        auth_result.node_id,
        auth_result.organization_id,
        &auth_result.node_name,
        auth_result.node_public_url.as_deref(),
        &projects_for_broadcast,
        &pool,
        &connections,
    )
    .await;

    // Set up heartbeat timeout
    let mut heartbeat_timeout = time::interval(HEARTBEAT_TIMEOUT);
    heartbeat_timeout.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut last_heartbeat = Utc::now();

    tracing::info!(
        node_id = %auth_result.node_id,
        organization_id = %auth_result.organization_id,
        "node session started"
    );

    // Main message loop
    loop {
        tokio::select! {
            // Handle outgoing messages from hive
            Some(msg) = rx.recv() => {
                if send_message(&mut ws_sender, &msg).await.is_err() {
                    break;
                }
            }

            // Handle incoming messages from node
            maybe_message = ws_receiver.next() => {
                match maybe_message {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<NodeMessage>(&text) {
                            Ok(msg) => {
                                if let Err(error) = handle_node_message(
                                    &msg,
                                    auth_result.node_id,
                                    auth_result.organization_id,
                                    &pool,
                                    &connections,
                                    &mut ws_sender,
                                    &mut last_heartbeat,
                                ).await {
                                    tracing::warn!(?error, "error handling node message");
                                }
                            }
                            Err(error) => {
                                tracing::debug!(?error, "invalid node message");
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        tracing::debug!("node sent close frame");
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if ws_sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {
                        // Ignore other message types
                    }
                    Some(Err(error)) => {
                        tracing::debug!(?error, "websocket receive error");
                        break;
                    }
                    None => break,
                }
            }

            // Check heartbeat timeout
            _ = heartbeat_timeout.tick() => {
                let elapsed = Utc::now().signed_duration_since(last_heartbeat);
                if elapsed > chrono::Duration::from_std(HEARTBEAT_TIMEOUT).unwrap() {
                    tracing::warn!(
                        node_id = %auth_result.node_id,
                        elapsed_secs = elapsed.num_seconds(),
                        "node heartbeat timeout"
                    );
                    let _ = send_message(
                        &mut ws_sender,
                        &HiveMessage::Close {
                            reason: "heartbeat timeout".to_string(),
                        },
                    ).await;
                    break;
                }
            }
        }
    }

    // Clean up
    connections.unregister(auth_result.node_id).await;

    // Update node status to offline
    let service = NodeServiceImpl::new(pool.clone());
    if let Err(error) = service
        .update_node_status(auth_result.node_id, NodeStatus::Offline)
        .await
    {
        tracing::warn!(?error, "failed to update node status to offline");
    }

    tracing::info!(
        node_id = %auth_result.node_id,
        "node session ended"
    );
}

/// Result of successful authentication.
struct AuthResult {
    node_id: Uuid,
    organization_id: Uuid,
    node_name: String,
    node_public_url: Option<String>,
    linked_projects: Vec<LinkedProjectInfo>,
}

/// Authentication error.
#[derive(Debug, thiserror::Error)]
enum AuthError {
    #[error("timeout waiting for auth message")]
    Timeout,
    #[error("connection closed before auth")]
    ConnectionClosed,
    #[error("invalid auth message: {0}")]
    InvalidMessage(String),
    #[error("invalid API key")]
    InvalidApiKey,
    #[error("API key revoked")]
    ApiKeyRevoked,
    #[error("protocol version mismatch: client={client}, server={server}")]
    ProtocolMismatch { client: u32, server: u32 },
    #[error("registration failed: {0}")]
    RegistrationFailed(String),
}

/// Wait for and process the authentication message.
async fn wait_for_auth(
    receiver: &mut futures::stream::SplitStream<WebSocket>,
    pool: &PgPool,
) -> Result<AuthResult, AuthError> {
    // Wait for auth message with timeout
    let auth_timeout = Duration::from_secs(30);
    let message = tokio::time::timeout(auth_timeout, receiver.next())
        .await
        .map_err(|_| AuthError::Timeout)?
        .ok_or(AuthError::ConnectionClosed)?
        .map_err(|e| AuthError::InvalidMessage(e.to_string()))?;

    let text = match message {
        Message::Text(text) => text,
        _ => {
            return Err(AuthError::InvalidMessage(
                "expected text message".to_string(),
            ));
        }
    };

    let node_msg: NodeMessage =
        serde_json::from_str(&text).map_err(|e| AuthError::InvalidMessage(e.to_string()))?;

    let auth = match node_msg {
        NodeMessage::Auth(auth) => auth,
        _ => {
            return Err(AuthError::InvalidMessage(
                "expected auth message".to_string(),
            ));
        }
    };

    Span::current().record("machine_id", &auth.machine_id);

    // Validate protocol version
    if auth.protocol_version != PROTOCOL_VERSION {
        return Err(AuthError::ProtocolMismatch {
            client: auth.protocol_version,
            server: PROTOCOL_VERSION,
        });
    }

    // Validate API key and get organization
    let service = NodeServiceImpl::new(pool.clone());
    let api_key = service.validate_api_key(&auth.api_key).await.map_err(|e| {
        tracing::debug!(?e, "API key validation failed");
        match e {
            crate::nodes::service::NodeError::ApiKeyRevoked => AuthError::ApiKeyRevoked,
            _ => AuthError::InvalidApiKey,
        }
    })?;

    // Store name and public_url for later use in broadcasts
    let node_name = auth.name.clone();
    let node_public_url = auth.public_url.clone();

    // Register or update the node
    let register_data = RegisterNode {
        name: auth.name,
        machine_id: auth.machine_id,
        capabilities: auth.capabilities,
        public_url: auth.public_url,
    };

    let node = service
        .register_node(api_key.organization_id, register_data)
        .await
        .map_err(|e| AuthError::RegistrationFailed(e.to_string()))?;

    // Get linked projects
    let linked_projects = service
        .list_node_projects(node.id)
        .await
        .map_err(|e| AuthError::RegistrationFailed(e.to_string()))?
        .into_iter()
        .map(|p| LinkedProjectInfo {
            link_id: p.id,
            project_id: p.project_id,
            local_project_id: p.local_project_id,
            git_repo_path: p.git_repo_path,
            default_branch: p.default_branch,
        })
        .collect();

    Ok(AuthResult {
        node_id: node.id,
        organization_id: node.organization_id,
        node_name,
        node_public_url,
        linked_projects,
    })
}

/// Handle an incoming message from a node.
async fn handle_node_message(
    msg: &NodeMessage,
    node_id: Uuid,
    organization_id: Uuid,
    pool: &PgPool,
    connections: &ConnectionManager,
    ws_sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    last_heartbeat: &mut chrono::DateTime<Utc>,
) -> Result<(), HandleError> {
    match msg {
        NodeMessage::Heartbeat(heartbeat) => {
            handle_heartbeat(
                node_id,
                heartbeat,
                pool,
                connections,
                ws_sender,
                last_heartbeat,
            )
            .await
        }
        NodeMessage::TaskStatus(status) => {
            handle_task_status(node_id, organization_id, status, pool).await
        }
        NodeMessage::TaskOutput(output) => handle_task_output(node_id, output, pool).await,
        NodeMessage::TaskProgress(progress) => handle_task_progress(node_id, progress, pool).await,
        NodeMessage::LinkProject(link) => {
            handle_link_project(node_id, organization_id, link, pool, connections).await
        }
        NodeMessage::UnlinkProject(unlink) => {
            handle_unlink_project(node_id, organization_id, unlink, pool, connections).await
        }
        NodeMessage::Deregister(deregister) => {
            handle_deregister(node_id, organization_id, deregister, pool, connections).await
        }
        NodeMessage::Ack { message_id } => {
            tracing::trace!(node_id = %node_id, message_id = %message_id, "received ack");
            Ok(())
        }
        NodeMessage::Error { message_id, error } => {
            tracing::warn!(
                node_id = %node_id,
                message_id = ?message_id,
                error = %error,
                "received error from node"
            );
            Ok(())
        }
        NodeMessage::Auth(_) => {
            // Auth should only happen once at connection start
            tracing::warn!(node_id = %node_id, "received unexpected auth message");
            Ok(())
        }
    }
}

/// Handle a heartbeat message.
async fn handle_heartbeat(
    node_id: Uuid,
    heartbeat: &HeartbeatMessage,
    pool: &PgPool,
    connections: &ConnectionManager,
    ws_sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    last_heartbeat: &mut chrono::DateTime<Utc>,
) -> Result<(), HandleError> {
    *last_heartbeat = Utc::now();

    // Update connection status
    connections
        .update_status(node_id, heartbeat.status, heartbeat.active_tasks)
        .await;

    // Update database
    let service = NodeServiceImpl::new(pool.clone());
    service
        .update_node_status(node_id, heartbeat.status)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    // Send heartbeat acknowledgement
    send_message(
        ws_sender,
        &HiveMessage::HeartbeatAck {
            server_time: Utc::now(),
        },
    )
    .await
    .map_err(|_| HandleError::Send)?;

    tracing::trace!(
        node_id = %node_id,
        status = ?heartbeat.status,
        active_tasks = heartbeat.active_tasks,
        "processed heartbeat"
    );

    Ok(())
}

/// Handle a task status update.
async fn handle_task_status(
    node_id: Uuid,
    _organization_id: Uuid,
    status: &TaskStatusMessage,
    pool: &PgPool,
) -> Result<(), HandleError> {
    use crate::db::task_assignments::TaskAssignmentRepository;
    use crate::db::tasks::{SharedTaskRepository, TaskStatus};

    let service = NodeServiceImpl::new(pool.clone());

    // Map execution status to database status string
    let db_status = match status.status {
        TaskExecutionStatus::Pending => "pending",
        TaskExecutionStatus::Starting => "starting",
        TaskExecutionStatus::Running => "running",
        TaskExecutionStatus::Completed => "completed",
        TaskExecutionStatus::Failed => "failed",
        TaskExecutionStatus::Cancelled => "cancelled",
    };

    // Update local IDs if provided
    if status.local_task_id.is_some() || status.local_attempt_id.is_some() {
        service
            .update_assignment_local_ids(
                status.assignment_id,
                status.local_task_id,
                status.local_attempt_id,
            )
            .await
            .map_err(|e| HandleError::Database(e.to_string()))?;
    }

    // Update execution status on the assignment
    service
        .update_assignment_status(status.assignment_id, db_status)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    // Also update the shared task status
    // First, get the task_id from the assignment
    let assignment_repo = TaskAssignmentRepository::new(pool);
    if let Ok(Some(assignment)) = assignment_repo.find_by_id(status.assignment_id).await {
        // Map execution status to shared task status
        let shared_status = match status.status {
            TaskExecutionStatus::Pending | TaskExecutionStatus::Starting => TaskStatus::Todo,
            TaskExecutionStatus::Running => TaskStatus::InProgress,
            TaskExecutionStatus::Completed => TaskStatus::InReview,
            TaskExecutionStatus::Failed | TaskExecutionStatus::Cancelled => TaskStatus::Todo,
        };

        let task_repo = SharedTaskRepository::new(pool);
        if let Err(e) = task_repo
            .update_status_from_node(assignment.task_id, shared_status)
            .await
        {
            tracing::warn!(
                task_id = %assignment.task_id,
                error = %e,
                "failed to update shared task status"
            );
        }
    }

    tracing::info!(
        node_id = %node_id,
        assignment_id = %status.assignment_id,
        status = ?status.status,
        "task status updated"
    );

    Ok(())
}

/// Handle task output/log messages from a node.
async fn handle_task_output(
    node_id: Uuid,
    output: &TaskOutputMessage,
    pool: &PgPool,
) -> Result<(), HandleError> {
    use crate::db::task_output_logs::{CreateTaskOutputLog, TaskOutputLogRepository};

    let output_type = match output.output_type {
        super::message::TaskOutputType::Stdout => "stdout",
        super::message::TaskOutputType::Stderr => "stderr",
        super::message::TaskOutputType::System => "system",
    };

    let repo = TaskOutputLogRepository::new(pool);
    repo.create(CreateTaskOutputLog {
        assignment_id: output.assignment_id,
        output_type: output_type.to_string(),
        content: output.content.clone(),
        timestamp: output.timestamp,
    })
    .await
    .map_err(|e| HandleError::Database(e.to_string()))?;

    tracing::trace!(
        node_id = %node_id,
        assignment_id = %output.assignment_id,
        output_type = %output_type,
        content_len = output.content.len(),
        "stored task output"
    );

    Ok(())
}

/// Handle task progress events from a node.
async fn handle_task_progress(
    node_id: Uuid,
    progress: &TaskProgressMessage,
    pool: &PgPool,
) -> Result<(), HandleError> {
    use crate::db::task_progress_events::{CreateTaskProgressEvent, TaskProgressEventRepository};

    let event_type = format!("{:?}", progress.event_type).to_lowercase();

    let repo = TaskProgressEventRepository::new(pool);
    repo.create(CreateTaskProgressEvent {
        assignment_id: progress.assignment_id,
        event_type,
        message: progress.message.clone(),
        metadata: progress.metadata.clone(),
        timestamp: progress.timestamp,
    })
    .await
    .map_err(|e| HandleError::Database(e.to_string()))?;

    tracing::debug!(
        node_id = %node_id,
        assignment_id = %progress.assignment_id,
        event_type = ?progress.event_type,
        "stored task progress event"
    );

    Ok(())
}

/// Handle a project link message from a node.
///
/// This creates an entry in the node_projects table linking the remote project
/// to this node's local project, then broadcasts the new link to all other nodes.
async fn handle_link_project(
    node_id: Uuid,
    organization_id: Uuid,
    link: &LinkProjectMessage,
    pool: &PgPool,
    connections: &ConnectionManager,
) -> Result<(), HandleError> {
    use crate::db::projects::ProjectRepository;
    use crate::nodes::domain::LinkProjectData;

    let service = NodeServiceImpl::new(pool.clone());

    let link_data = LinkProjectData {
        project_id: link.project_id,
        local_project_id: link.local_project_id,
        git_repo_path: link.git_repo_path.clone(),
        default_branch: link.default_branch.clone(),
    };

    let node_project = service
        .link_project(node_id, link_data)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    tracing::info!(
        node_id = %node_id,
        project_id = %link.project_id,
        local_project_id = %link.local_project_id,
        git_repo_path = %link.git_repo_path,
        "linked project to node"
    );

    // Broadcast the new project link to other nodes
    // Get node info and project name for the broadcast
    let node = service
        .get_node(node_id)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    let project_name = match ProjectRepository::fetch_by_id(pool, link.project_id).await {
        Ok(Some(project)) => project.name,
        _ => link
            .git_repo_path
            .rsplit('/')
            .next()
            .unwrap_or(&link.git_repo_path)
            .to_string(),
    };

    let sync_msg = HiveMessage::ProjectSync(ProjectSyncMessage {
        message_id: Uuid::new_v4(),
        link_id: node_project.id,
        project_id: link.project_id,
        project_name,
        local_project_id: link.local_project_id,
        git_repo_path: link.git_repo_path.clone(),
        default_branch: link.default_branch.clone(),
        source_node_id: node_id,
        source_node_name: node.name,
        source_node_public_url: node.public_url,
        is_new: true,
    });

    let failed = connections
        .broadcast_to_org_except(organization_id, node_id, sync_msg)
        .await;

    if !failed.is_empty() {
        tracing::warn!(
            node_id = %node_id,
            project_id = %link.project_id,
            failed_count = failed.len(),
            "failed to broadcast project link to some nodes"
        );
    }

    Ok(())
}

/// Handle a project unlink message from a node.
///
/// This removes the entry from the node_projects table and broadcasts the
/// removal to other nodes.
async fn handle_unlink_project(
    node_id: Uuid,
    organization_id: Uuid,
    unlink: &UnlinkProjectMessage,
    pool: &PgPool,
    connections: &ConnectionManager,
) -> Result<(), HandleError> {
    use crate::db::projects::ProjectRepository;

    let service = NodeServiceImpl::new(pool.clone());

    // Get node info before unlink for the broadcast
    let node = service
        .get_node(node_id)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    // Get the link info before deleting it
    let node_projects = service
        .list_node_projects(node_id)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    let link_info = node_projects
        .into_iter()
        .find(|p| p.project_id == unlink.project_id);

    service
        .unlink_project_for_node(node_id, unlink.project_id)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    tracing::info!(
        node_id = %node_id,
        project_id = %unlink.project_id,
        "unlinked project from node"
    );

    // Broadcast the unlink to other nodes (only if we found the link info)
    if let Some(link) = link_info {
        let project_name = match ProjectRepository::fetch_by_id(pool, unlink.project_id).await {
            Ok(Some(project)) => project.name,
            _ => link
                .git_repo_path
                .rsplit('/')
                .next()
                .unwrap_or(&link.git_repo_path)
                .to_string(),
        };

        let sync_msg = HiveMessage::ProjectSync(ProjectSyncMessage {
            message_id: Uuid::new_v4(),
            link_id: link.id,
            project_id: unlink.project_id,
            project_name,
            local_project_id: link.local_project_id,
            git_repo_path: link.git_repo_path,
            default_branch: link.default_branch,
            source_node_id: node_id,
            source_node_name: node.name,
            source_node_public_url: node.public_url,
            is_new: false, // false indicates removal
        });

        let failed = connections
            .broadcast_to_org_except(organization_id, node_id, sync_msg)
            .await;

        if !failed.is_empty() {
            tracing::warn!(
                node_id = %node_id,
                project_id = %unlink.project_id,
                failed_count = failed.len(),
                "failed to broadcast project unlink to some nodes"
            );
        }
    }

    Ok(())
}

/// Handle a node deregistration request.
///
/// This performs a hard delete of all node data and broadcasts the removal
/// to all other nodes in the organization.
async fn handle_deregister(
    node_id: Uuid,
    organization_id: Uuid,
    deregister: &DeregisterMessage,
    pool: &PgPool,
    connections: &ConnectionManager,
) -> Result<(), HandleError> {
    tracing::info!(
        node_id = %node_id,
        message_id = %deregister.message_id,
        reason = ?deregister.reason,
        "node requesting deregistration"
    );

    let service = NodeServiceImpl::new(pool.clone());

    // Delete the node (cascades all related data: node_projects, task_assignments)
    service
        .delete_node(node_id)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    // Broadcast node removal to all other nodes in the organization
    let removal_msg = HiveMessage::NodeRemoved(NodeRemovedMessage {
        node_id,
        reason: deregister
            .reason
            .clone()
            .unwrap_or_else(|| "Node deregistered".to_string()),
    });

    let failed = connections.broadcast_to_org(organization_id, removal_msg).await;
    if !failed.is_empty() {
        tracing::warn!(
            node_id = %node_id,
            failed_count = failed.len(),
            "failed to notify some nodes of deregistration"
        );
    }

    tracing::info!(
        node_id = %node_id,
        "node deregistered successfully"
    );

    Ok(())
}

/// Error when handling a node message.
#[derive(Debug, thiserror::Error)]
enum HandleError {
    #[error("database error: {0}")]
    Database(String),
    #[error("failed to send message")]
    Send,
}

/// Send a message to the WebSocket.
async fn send_message(
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    msg: &HiveMessage,
) -> Result<(), ()> {
    match serde_json::to_string(msg) {
        Ok(json) => sender
            .send(Message::Text(json.into()))
            .await
            .map_err(|error| {
                tracing::debug!(?error, "failed to send websocket message");
            }),
        Err(error) => {
            tracing::error!(?error, "failed to serialize message");
            Err(())
        }
    }
}

/// Broadcast a node's linked projects to all other nodes in the organization.
///
/// This is called when a node connects to notify other nodes about the newly
/// connected node's available projects.
async fn broadcast_node_projects(
    node_id: Uuid,
    organization_id: Uuid,
    node_name: &str,
    node_public_url: Option<&str>,
    linked_projects: &[LinkedProjectInfo],
    pool: &PgPool,
    connections: &ConnectionManager,
) {
    use crate::db::projects::ProjectRepository;

    if linked_projects.is_empty() {
        return;
    }

    for project_info in linked_projects {
        // Try to get the project name from the database
        let project_name = match ProjectRepository::fetch_by_id(pool, project_info.project_id).await
        {
            Ok(Some(project)) => project.name,
            _ => {
                // Fallback to using the git_repo_path as the name
                project_info
                    .git_repo_path
                    .rsplit('/')
                    .next()
                    .unwrap_or(&project_info.git_repo_path)
                    .to_string()
            }
        };

        let sync_msg = HiveMessage::ProjectSync(ProjectSyncMessage {
            message_id: Uuid::new_v4(),
            link_id: project_info.link_id,
            project_id: project_info.project_id,
            project_name,
            local_project_id: project_info.local_project_id,
            git_repo_path: project_info.git_repo_path.clone(),
            default_branch: project_info.default_branch.clone(),
            source_node_id: node_id,
            source_node_name: node_name.to_string(),
            source_node_public_url: node_public_url.map(String::from),
            is_new: true,
        });

        let failed = connections
            .broadcast_to_org_except(organization_id, node_id, sync_msg)
            .await;

        if !failed.is_empty() {
            tracing::warn!(
                node_id = %node_id,
                project_id = %project_info.project_id,
                failed_count = failed.len(),
                "failed to broadcast project to some nodes"
            );
        }
    }

    tracing::info!(
        node_id = %node_id,
        project_count = linked_projects.len(),
        "broadcast node projects to organization"
    );
}
