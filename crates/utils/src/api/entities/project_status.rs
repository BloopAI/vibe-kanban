//! ProjectStatus entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new project status.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectStatusRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The project this status belongs to.
    pub project_id: Uuid,
    /// Status name (e.g., "To do", "In progress").
    pub name: String,
    /// HSL color format: "H S% L%".
    pub color: String,
    /// Sort order for display.
    pub sort_order: i32,
    /// Whether this status is hidden in the default view.
    pub hidden: bool,
}

/// Request to update an existing project status (partial update).
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

/// Query parameters for listing project statuses.
#[derive(Debug, Clone, Deserialize)]
pub struct ListProjectStatusesQuery {
    pub project_id: Uuid,
}
