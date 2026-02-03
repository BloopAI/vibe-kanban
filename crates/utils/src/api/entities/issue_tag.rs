//! IssueTag entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new issue tag association.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueTagRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The issue being tagged.
    pub issue_id: Uuid,
    /// The tag to apply.
    pub tag_id: Uuid,
}

/// Request to update an existing issue tag (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueTagRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub tag_id: Option<Uuid>,
}

/// Query parameters for listing issue tags.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueTagsQuery {
    pub issue_id: Uuid,
}
