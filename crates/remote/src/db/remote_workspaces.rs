use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use super::types::WorkspacePrStatus;

/// Remote workspace metadata pushed from local clients
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RemoteWorkspace {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub owner_user_id: Uuid,
    pub task_id: Option<Uuid>,
    pub local_workspace_id: Uuid,
    pub archived: bool,
    pub files_changed: Option<i32>,
    pub lines_added: Option<i32>,
    pub lines_removed: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Repo association for a remote workspace
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RemoteWorkspaceRepo {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// PR tracking for a workspace repo
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RemoteWorkspacePr {
    pub id: Uuid,
    pub workspace_repo_id: Uuid,
    pub pr_url: String,
    pub pr_number: i32,
    pub pr_status: WorkspacePrStatus,
    pub merged_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
