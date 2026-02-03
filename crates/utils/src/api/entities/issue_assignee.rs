//! IssueAssignee entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new issue assignee.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueAssigneeRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The issue this assignee belongs to.
    pub issue_id: Uuid,
    /// The user being assigned.
    pub user_id: Uuid,
}

/// Request to update an existing issue assignee (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueAssigneeRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub user_id: Option<Uuid>,
}

/// Query parameters for listing issue assignees.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueAssigneesQuery {
    pub issue_id: Uuid,
}
