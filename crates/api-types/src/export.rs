use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExportRequest {
    pub organization_id: Uuid,
    /// If empty, exports all projects in the organization.
    pub project_ids: Vec<Uuid>,
    pub include_attachments: bool,
}
