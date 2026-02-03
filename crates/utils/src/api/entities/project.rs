//! Project entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRequest {
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
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListProjectsQuery {
    pub organization_id: Uuid,
}
