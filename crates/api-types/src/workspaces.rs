use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
pub struct DeleteWorkspaceRequest {
    pub local_workspace_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct CreateWorkspaceRequest {
    pub project_id: Uuid,
    pub local_workspace_id: Uuid,
    pub issue_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files_changed: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines_added: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines_removed: Option<i32>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateWorkspaceRequest {
    pub local_workspace_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files_changed: Option<Option<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines_added: Option<Option<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines_removed: Option<Option<i32>>,
}
