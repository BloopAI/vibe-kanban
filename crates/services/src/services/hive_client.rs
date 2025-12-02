//! Client for node-to-hive communication.
//!
//! This module provides a WebSocket-based client for nodes to connect to the
//! central hive server, register, send heartbeats, and receive task assignments.

use std::{sync::Arc, time::Duration};

use chrono::Utc;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::{
    sync::{RwLock, mpsc},
    time::{self, MissedTickBehavior},
};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;
use uuid::Uuid;

/// Heartbeat interval - how often to send heartbeats to the hive.
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// Reconnection delay on connection failure.
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// Maximum reconnection delay (for exponential backoff).
const MAX_RECONNECT_DELAY: Duration = Duration::from_secs(60);

/// Node status for heartbeats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    Pending,
    Online,
    Offline,
    Busy,
    Draining,
}

/// Node capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NodeCapabilities {
    #[serde(default)]
    pub executors: Vec<String>,
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_tasks: i32,
    #[serde(default)]
    pub os: String,
    #[serde(default)]
    pub arch: String,
    #[serde(default)]
    pub version: String,
}

fn default_max_concurrent() -> i32 {
    1
}

/// Configuration for the hive client.
#[derive(Debug, Clone)]
pub struct HiveClientConfig {
    /// Hive server URL (e.g., "wss://hive.example.com")
    pub hive_url: String,
    /// API key for authentication
    pub api_key: String,
    /// Human-readable node name
    pub node_name: String,
    /// Unique machine identifier
    pub machine_id: String,
    /// Node capabilities
    pub capabilities: NodeCapabilities,
    /// Public URL for direct connections (optional)
    pub public_url: Option<String>,
}

/// Messages sent from node to hive.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum NodeMessage {
    #[serde(rename = "auth")]
    Auth(AuthMessage),
    #[serde(rename = "heartbeat")]
    Heartbeat(HeartbeatMessage),
    #[serde(rename = "task_status")]
    TaskStatus(TaskStatusMessage),
    #[serde(rename = "task_output")]
    TaskOutput(TaskOutputMessage),
    #[serde(rename = "ack")]
    Ack { message_id: Uuid },
    #[serde(rename = "error")]
    Error {
        message_id: Option<Uuid>,
        error: String,
    },
}

/// Messages sent from hive to node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum HiveMessage {
    #[serde(rename = "auth_result")]
    AuthResult(AuthResultMessage),
    #[serde(rename = "task_assign")]
    TaskAssign(TaskAssignMessage),
    #[serde(rename = "task_cancel")]
    TaskCancel(TaskCancelMessage),
    #[serde(rename = "status_request")]
    StatusRequest { message_id: Uuid },
    #[serde(rename = "project_sync")]
    ProjectSync(ProjectSyncMessage),
    #[serde(rename = "heartbeat_ack")]
    HeartbeatAck { server_time: chrono::DateTime<Utc> },
    #[serde(rename = "error")]
    Error {
        message_id: Option<Uuid>,
        error: String,
    },
    #[serde(rename = "close")]
    Close { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMessage {
    pub api_key: String,
    pub machine_id: String,
    pub name: String,
    pub capabilities: NodeCapabilities,
    pub public_url: Option<String>,
    pub protocol_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResultMessage {
    pub success: bool,
    pub node_id: Option<Uuid>,
    pub organization_id: Option<Uuid>,
    pub error: Option<String>,
    pub protocol_version: u32,
    pub linked_projects: Vec<LinkedProjectInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedProjectInfo {
    pub link_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub git_repo_path: String,
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatMessage {
    pub status: NodeStatus,
    pub active_tasks: u32,
    pub available_capacity: u32,
    pub memory_usage: Option<u8>,
    pub cpu_usage: Option<u8>,
    pub timestamp: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskAssignMessage {
    pub message_id: Uuid,
    pub assignment_id: Uuid,
    pub task_id: Uuid,
    pub node_project_id: Uuid,
    pub local_project_id: Uuid,
    pub task: TaskDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDetails {
    pub title: String,
    pub description: Option<String>,
    pub executor: String,
    pub executor_variant: Option<String>,
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCancelMessage {
    pub message_id: Uuid,
    pub assignment_id: Uuid,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSyncMessage {
    pub message_id: Uuid,
    pub link_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub git_repo_path: String,
    pub default_branch: String,
    pub is_new: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStatusMessage {
    pub assignment_id: Uuid,
    pub local_task_id: Option<Uuid>,
    pub local_attempt_id: Option<Uuid>,
    pub status: TaskExecutionStatus,
    pub message: Option<String>,
    pub timestamp: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskExecutionStatus {
    Pending,
    Starting,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskOutputMessage {
    pub assignment_id: Uuid,
    pub output_type: TaskOutputType,
    pub content: String,
    pub timestamp: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskOutputType {
    Stdout,
    Stderr,
    System,
}

/// Protocol version
const PROTOCOL_VERSION: u32 = 1;

/// Events emitted by the hive client.
#[derive(Debug, Clone)]
pub enum HiveEvent {
    /// Connected to hive and authenticated
    Connected {
        node_id: Uuid,
        organization_id: Uuid,
        linked_projects: Vec<LinkedProjectInfo>,
    },
    /// Disconnected from hive
    Disconnected { reason: String },
    /// Task assignment received
    TaskAssigned(TaskAssignMessage),
    /// Task cancellation received
    TaskCancelled(TaskCancelMessage),
    /// Project sync received
    ProjectSync(ProjectSyncMessage),
    /// Error from hive
    Error { message: String },
}

/// State of the hive connection.
#[derive(Debug, Clone, Default)]
struct ConnectionState {
    node_id: Option<Uuid>,
    organization_id: Option<Uuid>,
    connected: bool,
}

/// Client for connecting to the hive server.
pub struct HiveClient {
    config: HiveClientConfig,
    state: Arc<RwLock<ConnectionState>>,
    event_tx: mpsc::Sender<HiveEvent>,
    command_tx: mpsc::Sender<NodeMessage>,
}

impl HiveClient {
    /// Create a new hive client.
    ///
    /// Returns:
    /// - The client itself
    /// - A receiver for events from the hive
    /// - A sender for commands to the hive
    /// - A receiver for commands (pass this to `run()`)
    pub fn new(
        config: HiveClientConfig,
    ) -> (
        Self,
        mpsc::Receiver<HiveEvent>,
        mpsc::Sender<NodeMessage>,
        mpsc::Receiver<NodeMessage>,
    ) {
        let (event_tx, event_rx) = mpsc::channel(64);
        let (command_tx, command_rx) = mpsc::channel(64);

        let client = Self {
            config,
            state: Arc::new(RwLock::new(ConnectionState::default())),
            event_tx,
            command_tx: command_tx.clone(),
        };

        (client, event_rx, command_tx, command_rx)
    }

    /// Start the connection loop (call this in a spawned task).
    pub async fn run(self, mut command_rx: mpsc::Receiver<NodeMessage>) {
        let mut reconnect_delay = RECONNECT_DELAY;

        loop {
            match self.connect_and_run(&mut command_rx).await {
                Ok(()) => {
                    // Clean disconnect
                    tracing::info!("hive connection closed cleanly");
                    reconnect_delay = RECONNECT_DELAY;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "hive connection error");
                    let _ = self
                        .event_tx
                        .send(HiveEvent::Disconnected {
                            reason: e.to_string(),
                        })
                        .await;
                }
            }

            // Update state
            {
                let mut state = self.state.write().await;
                state.connected = false;
            }

            // Wait before reconnecting with exponential backoff
            tracing::info!(
                delay_secs = reconnect_delay.as_secs(),
                "reconnecting to hive"
            );
            tokio::time::sleep(reconnect_delay).await;
            reconnect_delay = std::cmp::min(reconnect_delay * 2, MAX_RECONNECT_DELAY);
        }
    }

    /// Connect to the hive and run the message loop.
    async fn connect_and_run(
        &self,
        command_rx: &mut mpsc::Receiver<NodeMessage>,
    ) -> Result<(), HiveClientError> {
        // Build WebSocket URL
        let ws_url = self.build_ws_url()?;
        tracing::info!(url = %ws_url, "connecting to hive");

        // Connect
        let (ws_stream, _response) = connect_async(&ws_url)
            .await
            .map_err(|e| HiveClientError::Connection(e.to_string()))?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Send auth message
        let auth_msg = NodeMessage::Auth(AuthMessage {
            api_key: self.config.api_key.clone(),
            machine_id: self.config.machine_id.clone(),
            name: self.config.node_name.clone(),
            capabilities: self.config.capabilities.clone(),
            public_url: self.config.public_url.clone(),
            protocol_version: PROTOCOL_VERSION,
        });

        let auth_json =
            serde_json::to_string(&auth_msg).map_err(|e| HiveClientError::Serde(e.to_string()))?;
        ws_sender
            .send(Message::Text(auth_json.into()))
            .await
            .map_err(|e| HiveClientError::Send(e.to_string()))?;

        // Wait for auth response
        let auth_response = tokio::time::timeout(Duration::from_secs(30), ws_receiver.next())
            .await
            .map_err(|_| HiveClientError::Timeout)?
            .ok_or(HiveClientError::Connection("connection closed".to_string()))?
            .map_err(|e| HiveClientError::Connection(e.to_string()))?;

        let auth_result = self.parse_auth_response(auth_response)?;

        if !auth_result.success {
            return Err(HiveClientError::Auth(auth_result.error.unwrap_or_default()));
        }

        let node_id = auth_result.node_id.ok_or(HiveClientError::Auth(
            "no node_id in auth response".to_string(),
        ))?;
        let organization_id = auth_result.organization_id.ok_or(HiveClientError::Auth(
            "no organization_id in auth response".to_string(),
        ))?;

        // Update state
        {
            let mut state = self.state.write().await;
            state.node_id = Some(node_id);
            state.organization_id = Some(organization_id);
            state.connected = true;
        }

        // Emit connected event
        let _ = self
            .event_tx
            .send(HiveEvent::Connected {
                node_id,
                organization_id,
                linked_projects: auth_result.linked_projects,
            })
            .await;

        tracing::info!(
            node_id = %node_id,
            organization_id = %organization_id,
            "connected to hive"
        );

        // Set up heartbeat timer
        let mut heartbeat_interval = time::interval(HEARTBEAT_INTERVAL);
        heartbeat_interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

        // Message loop
        loop {
            tokio::select! {
                // Handle incoming messages from hive
                maybe_message = ws_receiver.next() => {
                    match maybe_message {
                        Some(Ok(Message::Text(text))) => {
                            if let Err(e) = self.handle_hive_message(&text).await {
                                tracing::warn!(error = %e, "failed to handle hive message");
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            tracing::debug!("hive sent close frame");
                            return Ok(());
                        }
                        Some(Ok(Message::Ping(data))) => {
                            if let Err(e) = ws_sender.send(Message::Pong(data)).await {
                                return Err(HiveClientError::Send(e.to_string()));
                            }
                        }
                        Some(Ok(_)) => {
                            // Ignore other message types
                        }
                        Some(Err(e)) => {
                            return Err(HiveClientError::Connection(e.to_string()));
                        }
                        None => {
                            return Err(HiveClientError::Connection("connection closed".to_string()));
                        }
                    }
                }

                // Handle commands from the application
                Some(cmd) = command_rx.recv() => {
                    let json = serde_json::to_string(&cmd)
                        .map_err(|e| HiveClientError::Serde(e.to_string()))?;
                    ws_sender.send(Message::Text(json.into())).await
                        .map_err(|e| HiveClientError::Send(e.to_string()))?;
                }

                // Send heartbeat
                _ = heartbeat_interval.tick() => {
                    let heartbeat = NodeMessage::Heartbeat(HeartbeatMessage {
                        status: NodeStatus::Online, // TODO: Get actual status
                        active_tasks: 0, // TODO: Get actual count
                        available_capacity: self.config.capabilities.max_concurrent_tasks as u32,
                        memory_usage: None,
                        cpu_usage: None,
                        timestamp: Utc::now(),
                    });
                    let json = serde_json::to_string(&heartbeat)
                        .map_err(|e| HiveClientError::Serde(e.to_string()))?;
                    ws_sender.send(Message::Text(json.into())).await
                        .map_err(|e| HiveClientError::Send(e.to_string()))?;
                }
            }
        }
    }

    /// Build the WebSocket URL for connecting to the hive.
    fn build_ws_url(&self) -> Result<Url, HiveClientError> {
        let mut url =
            Url::parse(&self.config.hive_url).map_err(|e| HiveClientError::Url(e.to_string()))?;

        // Convert http(s) to ws(s) if needed
        match url.scheme() {
            "http" => url
                .set_scheme("ws")
                .map_err(|()| HiveClientError::Url("failed to set scheme".to_string()))?,
            "https" => url
                .set_scheme("wss")
                .map_err(|()| HiveClientError::Url("failed to set scheme".to_string()))?,
            "ws" | "wss" => {}
            other => {
                return Err(HiveClientError::Url(format!(
                    "unsupported scheme: {}",
                    other
                )));
            }
        }

        // Append WebSocket path
        url.set_path("/v1/nodes/ws");

        Ok(url)
    }

    /// Parse the auth response from the hive.
    fn parse_auth_response(&self, message: Message) -> Result<AuthResultMessage, HiveClientError> {
        let text = match message {
            Message::Text(text) => text,
            _ => {
                return Err(HiveClientError::Protocol(
                    "expected text message".to_string(),
                ));
            }
        };

        let hive_msg: HiveMessage =
            serde_json::from_str(&text).map_err(|e| HiveClientError::Serde(e.to_string()))?;

        match hive_msg {
            HiveMessage::AuthResult(result) => Ok(result),
            HiveMessage::Error { error, .. } => Err(HiveClientError::Auth(error)),
            _ => Err(HiveClientError::Protocol(
                "expected auth_result message".to_string(),
            )),
        }
    }

    /// Handle a message from the hive.
    async fn handle_hive_message(&self, text: &str) -> Result<(), HiveClientError> {
        let hive_msg: HiveMessage =
            serde_json::from_str(text).map_err(|e| HiveClientError::Serde(e.to_string()))?;

        match hive_msg {
            HiveMessage::TaskAssign(assign) => {
                tracing::info!(
                    assignment_id = %assign.assignment_id,
                    task_id = %assign.task_id,
                    "received task assignment"
                );
                let _ = self.event_tx.send(HiveEvent::TaskAssigned(assign)).await;
            }
            HiveMessage::TaskCancel(cancel) => {
                tracing::info!(
                    assignment_id = %cancel.assignment_id,
                    "received task cancellation"
                );
                let _ = self.event_tx.send(HiveEvent::TaskCancelled(cancel)).await;
            }
            HiveMessage::ProjectSync(sync) => {
                tracing::info!(
                    project_id = %sync.project_id,
                    is_new = sync.is_new,
                    "received project sync"
                );
                let _ = self.event_tx.send(HiveEvent::ProjectSync(sync)).await;
            }
            HiveMessage::HeartbeatAck { server_time } => {
                tracing::trace!(server_time = %server_time, "heartbeat acknowledged");
            }
            HiveMessage::Error { error, .. } => {
                tracing::warn!(error = %error, "received error from hive");
                let _ = self
                    .event_tx
                    .send(HiveEvent::Error { message: error })
                    .await;
            }
            HiveMessage::Close { reason } => {
                tracing::info!(reason = %reason, "hive requested close");
                return Err(HiveClientError::Connection(reason));
            }
            _ => {
                tracing::debug!(?hive_msg, "ignoring unhandled hive message");
            }
        }

        Ok(())
    }

    /// Check if connected to the hive.
    pub async fn is_connected(&self) -> bool {
        self.state.read().await.connected
    }

    /// Get the node ID (if connected).
    pub async fn node_id(&self) -> Option<Uuid> {
        self.state.read().await.node_id
    }

    /// Get the organization ID (if connected).
    pub async fn organization_id(&self) -> Option<Uuid> {
        self.state.read().await.organization_id
    }

    /// Send a task status update.
    pub async fn send_task_status(&self, status: TaskStatusMessage) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::TaskStatus(status))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }

    /// Send task output.
    pub async fn send_task_output(&self, output: TaskOutputMessage) -> Result<(), HiveClientError> {
        self.command_tx
            .send(NodeMessage::TaskOutput(output))
            .await
            .map_err(|_| HiveClientError::Send("channel closed".to_string()))
    }
}

/// Errors from the hive client.
#[derive(Debug, thiserror::Error)]
pub enum HiveClientError {
    #[error("connection error: {0}")]
    Connection(String),
    #[error("authentication failed: {0}")]
    Auth(String),
    #[error("url error: {0}")]
    Url(String),
    #[error("serialization error: {0}")]
    Serde(String),
    #[error("send error: {0}")]
    Send(String),
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("timeout")]
    Timeout,
}

/// Detect node capabilities from the system.
pub fn detect_capabilities() -> NodeCapabilities {
    NodeCapabilities {
        executors: vec!["CLAUDE_CODE".to_string()], // Default supported executor
        max_concurrent_tasks: 1,
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Generate a stable machine ID.
pub fn get_machine_id() -> String {
    // Use hostname + a hash of system info for stability
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    hostname.hash(&mut hasher);
    std::env::consts::OS.hash(&mut hasher);
    std::env::consts::ARCH.hash(&mut hasher);

    format!("{:016x}", hasher.finish())
}
