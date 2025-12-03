//! WebSocket message types for node-hive communication.
//!
//! This module defines the protocol for bidirectional communication between
//! nodes (local instances) and the hive (remote server).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::nodes::domain::{NodeCapabilities, NodeStatus};

/// Messages sent from a node to the hive.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum NodeMessage {
    /// Initial authentication handshake
    #[serde(rename = "auth")]
    Auth(AuthMessage),

    /// Periodic heartbeat with status update
    #[serde(rename = "heartbeat")]
    Heartbeat(HeartbeatMessage),

    /// Task execution status update
    #[serde(rename = "task_status")]
    TaskStatus(TaskStatusMessage),

    /// Task execution output/logs
    #[serde(rename = "task_output")]
    TaskOutput(TaskOutputMessage),

    /// Task progress event (milestones)
    #[serde(rename = "task_progress")]
    TaskProgress(TaskProgressMessage),

    /// Link a project from the node to a remote project
    #[serde(rename = "link_project")]
    LinkProject(LinkProjectMessage),

    /// Unlink a project from the hive
    #[serde(rename = "unlink_project")]
    UnlinkProject(UnlinkProjectMessage),

    /// Acknowledgement of a hive message
    #[serde(rename = "ack")]
    Ack { message_id: Uuid },

    /// Error response
    #[serde(rename = "error")]
    Error {
        message_id: Option<Uuid>,
        error: String,
    },
}

/// Messages sent from the hive to a node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum HiveMessage {
    /// Authentication result
    #[serde(rename = "auth_result")]
    AuthResult(AuthResultMessage),

    /// Assign a task to the node
    #[serde(rename = "task_assign")]
    TaskAssign(TaskAssignMessage),

    /// Cancel a running task
    #[serde(rename = "task_cancel")]
    TaskCancel(TaskCancelMessage),

    /// Request immediate status update
    #[serde(rename = "status_request")]
    StatusRequest { message_id: Uuid },

    /// Sync project information
    #[serde(rename = "project_sync")]
    ProjectSync(ProjectSyncMessage),

    /// Heartbeat acknowledgement
    #[serde(rename = "heartbeat_ack")]
    HeartbeatAck { server_time: DateTime<Utc> },

    /// Error message
    #[serde(rename = "error")]
    Error {
        message_id: Option<Uuid>,
        error: String,
    },

    /// Connection closing
    #[serde(rename = "close")]
    Close { reason: String },
}

/// Authentication message from node to hive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMessage {
    /// API key for authentication
    pub api_key: String,
    /// Unique machine identifier
    pub machine_id: String,
    /// Human-readable node name
    pub name: String,
    /// Node capabilities
    pub capabilities: NodeCapabilities,
    /// Public URL where this node can be reached (optional)
    pub public_url: Option<String>,
    /// Protocol version for compatibility
    pub protocol_version: u32,
}

/// Authentication result from hive to node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResultMessage {
    /// Whether authentication succeeded
    pub success: bool,
    /// Assigned node ID (if successful)
    pub node_id: Option<Uuid>,
    /// Organization ID (if successful)
    pub organization_id: Option<Uuid>,
    /// Error message (if failed)
    pub error: Option<String>,
    /// Server's protocol version
    pub protocol_version: u32,
    /// Projects linked to this node
    pub linked_projects: Vec<LinkedProjectInfo>,
}

/// Information about a linked project sent during auth.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedProjectInfo {
    pub link_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub git_repo_path: String,
    pub default_branch: String,
}

/// Heartbeat message from node to hive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatMessage {
    /// Current node status
    pub status: NodeStatus,
    /// Number of tasks currently executing
    pub active_tasks: u32,
    /// Available executor capacity
    pub available_capacity: u32,
    /// Memory usage percentage (0-100)
    pub memory_usage: Option<u8>,
    /// CPU usage percentage (0-100)
    pub cpu_usage: Option<u8>,
    /// Timestamp from the node
    pub timestamp: DateTime<Utc>,
}

/// Task assignment from hive to node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskAssignMessage {
    /// Unique message ID for acknowledgement
    pub message_id: Uuid,
    /// Assignment ID in the hive database
    pub assignment_id: Uuid,
    /// Task ID in the hive database
    pub task_id: Uuid,
    /// Node project link ID
    pub node_project_id: Uuid,
    /// Local project ID on the node
    pub local_project_id: Uuid,
    /// Task details
    pub task: TaskDetails,
}

/// Task details sent with assignment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDetails {
    pub title: String,
    pub description: Option<String>,
    pub executor: String,
    pub executor_variant: Option<String>,
    pub base_branch: String,
}

/// Task cancellation request from hive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCancelMessage {
    /// Unique message ID for acknowledgement
    pub message_id: Uuid,
    /// Assignment ID to cancel
    pub assignment_id: Uuid,
    /// Reason for cancellation
    pub reason: Option<String>,
}

/// Task status update from node to hive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStatusMessage {
    /// Assignment ID
    pub assignment_id: Uuid,
    /// Local task ID on the node
    pub local_task_id: Option<Uuid>,
    /// Local attempt ID on the node
    pub local_attempt_id: Option<Uuid>,
    /// Current execution status
    pub status: TaskExecutionStatus,
    /// Status message/details
    pub message: Option<String>,
    /// Timestamp
    pub timestamp: DateTime<Utc>,
}

/// Task execution status values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskExecutionStatus {
    /// Task received and queued
    Pending,
    /// Task is starting
    Starting,
    /// Task is running
    Running,
    /// Task completed successfully
    Completed,
    /// Task failed
    Failed,
    /// Task was cancelled
    Cancelled,
}

/// Task output/log stream from node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskOutputMessage {
    /// Assignment ID
    pub assignment_id: Uuid,
    /// Output type
    pub output_type: TaskOutputType,
    /// Output content
    pub content: String,
    /// Timestamp
    pub timestamp: DateTime<Utc>,
}

/// Type of task output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskOutputType {
    Stdout,
    Stderr,
    System,
}

/// Task progress event from node to hive.
///
/// Progress events represent significant milestones during task execution,
/// such as agent startup, PR creation, or branch pushes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProgressMessage {
    /// Assignment ID
    pub assignment_id: Uuid,
    /// Type of progress event
    pub event_type: TaskProgressType,
    /// Optional message/description
    pub message: Option<String>,
    /// Optional metadata (e.g., PR URL, branch name)
    pub metadata: Option<serde_json::Value>,
    /// Timestamp
    pub timestamp: DateTime<Utc>,
}

/// Type of task progress event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskProgressType {
    /// Agent has started processing
    AgentStarted,
    /// Agent is thinking/planning
    AgentThinking,
    /// Code changes being made
    CodeChanges,
    /// Branch has been created
    BranchCreated,
    /// Changes have been committed
    Committed,
    /// Branch has been pushed
    Pushed,
    /// Pull request created
    PullRequestCreated,
    /// Agent finished (use status update for success/failure)
    AgentFinished,
    /// Custom milestone
    Custom,
}

/// Link a project from node to hive.
///
/// Sent by the node when a user links a local project to a remote project.
/// This creates an entry in the hive's node_projects table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkProjectMessage {
    /// The remote project ID (from the hive's projects table)
    pub project_id: Uuid,
    /// The local project ID on the node
    pub local_project_id: Uuid,
    /// Path to the git repository on the node
    pub git_repo_path: String,
    /// Default branch for the project
    #[serde(default = "default_branch")]
    pub default_branch: String,
}

fn default_branch() -> String {
    "main".to_string()
}

/// Unlink a project from the hive.
///
/// Sent by the node when a user unlinks a local project.
/// This removes the entry from the hive's node_projects table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlinkProjectMessage {
    /// The remote project ID to unlink
    pub project_id: Uuid,
}

/// Project sync message from hive to node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSyncMessage {
    /// Unique message ID for acknowledgement
    pub message_id: Uuid,
    /// Link ID
    pub link_id: Uuid,
    /// Project ID in the hive
    pub project_id: Uuid,
    /// Local project ID on the node
    pub local_project_id: Uuid,
    /// Git repository path
    pub git_repo_path: String,
    /// Default branch
    pub default_branch: String,
    /// Whether this is a new link or update
    pub is_new: bool,
}

/// Current protocol version.
pub const PROTOCOL_VERSION: u32 = 1;
