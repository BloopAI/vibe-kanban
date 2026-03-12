use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::PullRequestStatus;

#[derive(Debug, Deserialize, Serialize)]
pub struct UpsertPullRequestRequest {
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub local_workspace_id: Uuid,
}

/// Request to create a PR on the remote server, linked directly to an issue
#[derive(Debug, Deserialize, Serialize)]
pub struct CreatePullRequestApiRequest {
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub issue_id: Uuid,
    pub local_workspace_id: Option<Uuid>,
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
