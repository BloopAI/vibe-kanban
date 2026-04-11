use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct IssueFollower {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueFollowerRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueFollowersQuery {
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct ListIssueFollowersResponse {
    pub issue_followers: Vec<IssueFollower>,
}
