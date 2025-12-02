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
        AuthResultMessage, HeartbeatMessage, HiveMessage, LinkedProjectInfo, NodeMessage,
        PROTOCOL_VERSION, TaskExecutionStatus, TaskStatusMessage,
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
        NodeMessage::TaskOutput(output) => {
            // TODO: Implement task output streaming
            tracing::debug!(
                node_id = %node_id,
                assignment_id = %output.assignment_id,
                output_type = ?output.output_type,
                "received task output"
            );
            Ok(())
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

    // Update execution status
    service
        .update_assignment_status(status.assignment_id, db_status)
        .await
        .map_err(|e| HandleError::Database(e.to_string()))?;

    tracing::info!(
        node_id = %node_id,
        assignment_id = %status.assignment_id,
        status = ?status.status,
        "task status updated"
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
