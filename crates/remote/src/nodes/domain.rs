use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Node status enum matching the PostgreSQL type
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "node_status", rename_all = "snake_case")]
pub enum NodeStatus {
    /// Registered but never connected
    #[default]
    Pending,
    /// Connected and healthy
    Online,
    /// Disconnected
    Offline,
    /// Executing task(s)
    Busy,
    /// No new work, finishing current
    Draining,
}

/// Node capabilities describing what a node can execute
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NodeCapabilities {
    /// List of executor types this node supports (e.g., ["CLAUDE_CODE", "CODEX", "GEMINI"])
    #[serde(default)]
    pub executors: Vec<String>,
    /// Maximum number of concurrent tasks
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_tasks: i32,
    /// Operating system (e.g., "darwin", "linux", "windows")
    #[serde(default)]
    pub os: String,
    /// CPU architecture (e.g., "arm64", "x86_64")
    #[serde(default)]
    pub arch: String,
    /// Vibe Kanban version running on the node
    #[serde(default)]
    pub version: String,
}

fn default_max_concurrent() -> i32 {
    1
}

/// API key for node authentication (machine-to-machine)
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct NodeApiKey {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    #[serde(skip_serializing)]
    pub key_hash: String,
    pub key_prefix: String,
    pub created_by: Option<Uuid>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Data for creating a new API key
#[derive(Debug, Clone, Deserialize)]
pub struct CreateNodeApiKey {
    pub name: String,
}

/// A registered node in the swarm
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Node {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub machine_id: String,
    pub status: NodeStatus,
    #[sqlx(json)]
    pub capabilities: NodeCapabilities,
    pub public_url: Option<String>,
    pub last_heartbeat_at: Option<DateTime<Utc>>,
    pub connected_at: Option<DateTime<Utc>>,
    pub disconnected_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data for registering a new node
#[derive(Debug, Clone, Deserialize)]
pub struct NodeRegistration {
    pub name: String,
    pub machine_id: String,
    #[serde(default)]
    pub capabilities: NodeCapabilities,
    pub public_url: Option<String>,
}

/// Heartbeat payload sent by nodes
#[derive(Debug, Clone, Deserialize)]
pub struct HeartbeatPayload {
    pub status: NodeStatus,
    #[serde(default)]
    pub active_tasks: Vec<Uuid>,
}

/// Link between a node and a project
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct NodeProject {
    pub id: Uuid,
    pub node_id: Uuid,
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub git_repo_path: String,
    pub default_branch: String,
    pub sync_status: String,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Data for linking a project to a node
#[derive(Debug, Clone, Deserialize)]
pub struct LinkProjectData {
    pub project_id: Uuid,
    pub local_project_id: Uuid,
    pub git_repo_path: String,
    #[serde(default = "default_branch")]
    pub default_branch: String,
}

fn default_branch() -> String {
    "main".to_string()
}

/// Task assignment to a node
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct NodeTaskAssignment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub node_id: Uuid,
    pub node_project_id: Uuid,
    pub local_task_id: Option<Uuid>,
    pub local_attempt_id: Option<Uuid>,
    pub execution_status: String,
    pub assigned_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Data for updating a task assignment
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAssignmentData {
    pub local_task_id: Option<Uuid>,
    pub local_attempt_id: Option<Uuid>,
    pub execution_status: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_status_serialization() {
        assert_eq!(
            serde_json::to_string(&NodeStatus::Online).unwrap(),
            "\"online\""
        );
        assert_eq!(
            serde_json::to_string(&NodeStatus::Busy).unwrap(),
            "\"busy\""
        );
    }

    #[test]
    fn test_node_capabilities_defaults() {
        let caps: NodeCapabilities = serde_json::from_str("{}").unwrap();
        assert_eq!(caps.max_concurrent_tasks, 1);
        assert!(caps.executors.is_empty());
    }

    #[test]
    fn test_node_capabilities_full() {
        let json = r#"{
            "executors": ["CLAUDE_CODE", "GEMINI"],
            "max_concurrent_tasks": 3,
            "os": "darwin",
            "arch": "arm64",
            "version": "0.5.0"
        }"#;
        let caps: NodeCapabilities = serde_json::from_str(json).unwrap();
        assert_eq!(caps.executors.len(), 2);
        assert_eq!(caps.max_concurrent_tasks, 3);
        assert_eq!(caps.os, "darwin");
    }
}
