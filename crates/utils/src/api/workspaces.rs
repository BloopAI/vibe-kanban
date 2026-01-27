use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct DeleteWorkspaceRequest {
    pub local_workspace_id: Uuid,
}
