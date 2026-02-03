//! IssueFollower entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new issue follower.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueFollowerRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The issue being followed.
    pub issue_id: Uuid,
    /// The user following the issue.
    pub user_id: Uuid,
}

/// Request to update an existing issue follower (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueFollowerRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub user_id: Option<Uuid>,
}

/// Query parameters for listing issue followers.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueFollowersQuery {
    pub issue_id: Uuid,
}
