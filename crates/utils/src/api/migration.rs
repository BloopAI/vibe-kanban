use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrateProjectRequest {
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrateIssueRequest {
    pub project_id: Uuid,
    pub status_name: String,
    pub title: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigratePullRequestRequest {
    pub url: String,
    pub number: i32,
    pub status: String,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrateWorkspaceRequest {
    pub project_id: Uuid,
    pub issue_id: Option<Uuid>,
    pub local_workspace_id: Uuid,
    pub archived: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkMigrateRequest<T> {
    pub items: Vec<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkMigrateResponse {
    pub ids: Vec<Uuid>,
}
