//! IssueAssignee entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueAssigneeRequest {
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueAssigneeRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueAssigneesQuery {
    pub issue_id: Uuid,
}
