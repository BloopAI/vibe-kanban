//! ProjectStatus entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectStatusRequest {
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
    pub hidden: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateProjectStatusRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub color: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub sort_order: Option<i32>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub hidden: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListProjectStatusesQuery {
    pub project_id: Uuid,
}
