use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct DeleteWorkspaceRequest {
    pub local_workspace_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct CreateWorkspaceRequest {
    pub project_id: Uuid,
    pub local_workspace_id: Uuid,
    pub issue_id: Uuid,
}
