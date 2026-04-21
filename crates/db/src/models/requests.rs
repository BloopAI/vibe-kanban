use executors::profile::ExecutorConfig;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::{execution_process::ExecutionProcess, workspace::Workspace};

#[derive(Debug, Deserialize, Serialize)]
pub struct ContainerQuery {
    #[serde(rename = "ref")]
    pub container_ref: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct WorkspaceRepoInput {
    pub repo_id: Uuid,
    pub target_branch: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateWorkspaceApiRequest {
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct LinkedIssueInfo {
    pub remote_project_id: Uuid,
    pub issue_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateAndStartWorkspaceRequest {
    pub name: Option<String>,
    pub repos: Vec<WorkspaceRepoInput>,
    pub linked_issue: Option<LinkedIssueInfo>,
    pub executor_config: ExecutorConfig,
    pub prompt: String,
    pub attachment_ids: Option<Vec<Uuid>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adopt_cursor_mcp_lobby_bridge_session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreateAndStartWorkspaceResponse {
    pub workspace: Workspace,
    pub execution_process: ExecutionProcess,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdateWorkspace {
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdateSession {
    pub name: Option<String>,
}

/// Atomic "seed a task + workspace + kick off execution" request used by
/// the MCP bridge (`POST /api/tasks/start`). Mirrors a subset of
/// `CreateAndStartWorkspaceRequest` but keyed to a freshly created Task.
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct StartTaskRequest {
    pub task: StartTaskTaskSpec,
    pub workspace: StartTaskWorkspaceSpec,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct StartTaskTaskSpec {
    pub project_id: Uuid,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_workspace_id: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct StartTaskWorkspaceSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub repos: Vec<WorkspaceRepoInput>,
    pub executor_config: ExecutorConfig,
    pub prompt: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct StartTaskResponse {
    pub task_id: Uuid,
    pub workspace_id: Uuid,
    pub execution_id: Uuid,
}
