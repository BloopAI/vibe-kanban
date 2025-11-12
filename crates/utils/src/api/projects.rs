use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RemoteProject {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListProjectsResponse {
    pub projects: Vec<RemoteProject>,
}
