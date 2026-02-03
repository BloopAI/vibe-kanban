//! Project entity types.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

// =============================================================================
// Row type
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// =============================================================================
// Request types
// =============================================================================

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
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListProjectsQuery {
    pub organization_id: Uuid,
}

// =============================================================================
// Response types
// =============================================================================

#[derive(Debug, Clone, Serialize, TS)]
pub struct ListProjectsResponse {
    pub projects: Vec<Project>,
}
