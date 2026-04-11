use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Type;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS, JsonSchema)]
#[sqlx(type_name = "pull_request_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum PullRequestStatus {
    Open,
    Merged,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PullRequest {
    pub id: Uuid,
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub project_id: Uuid,
    #[deprecated(note = "use pull_request_issues join table instead")]
    pub issue_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PullRequestIssue {
    pub id: Uuid,
    pub pull_request_id: Uuid,
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListPullRequestsQuery {
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListPullRequestsResponse {
    pub pull_requests: Vec<PullRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListPullRequestIssuesResponse {
    pub pull_request_issues: Vec<PullRequestIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreatePullRequestIssueRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
}

/// Request to update a PR status on the remote server.
#[derive(Debug, Deserialize, Serialize)]
pub struct UpdatePullRequestApiRequest {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<PullRequestStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_at: Option<Option<DateTime<Utc>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_commit_sha: Option<Option<String>>,
}
