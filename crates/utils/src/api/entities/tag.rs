//! Tag entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new tag.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateTagRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The project this tag belongs to.
    pub project_id: Uuid,
    /// Tag name.
    pub name: String,
    /// HSL color format: "H S% L%".
    pub color: String,
}

/// Request to update an existing tag (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateTagRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub color: Option<String>,
}

/// Query parameters for listing tags.
#[derive(Debug, Clone, Deserialize)]
pub struct ListTagsQuery {
    pub project_id: Uuid,
}
