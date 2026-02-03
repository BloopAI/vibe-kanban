//! Project entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new project.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CreateProjectRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The organization this project belongs to.
    pub organization_id: Uuid,
    /// Project name.
    pub name: String,
    /// HSL color format: "H S% L%".
    pub color: String,
}

/// Request to update an existing project (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct UpdateProjectRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub color: Option<String>,
}

/// Query parameters for listing projects.
#[derive(Debug, Clone, Deserialize)]
pub struct ListProjectsQuery {
    pub organization_id: Uuid,
}
