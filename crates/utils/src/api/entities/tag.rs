//! Tag entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateTagRequest {
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateTagRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListTagsQuery {
    pub project_id: Uuid,
}
