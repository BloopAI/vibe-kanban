use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateProjectRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub color: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListProjectsQuery {
    pub organization_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListProjectsResponse {
    pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkUpdateProjectItem {
    pub id: Uuid,
    #[serde(flatten)]
    pub changes: UpdateProjectRequest,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkUpdateProjectsRequest {
    pub updates: Vec<BulkUpdateProjectItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkUpdateProjectsResponse {
    pub data: Vec<Project>,
    pub txid: i64,
}
