//! IssueRelationship entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;
use crate::api::types::IssueRelationshipType;

/// Request to create a new issue relationship.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueRelationshipRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The source issue.
    pub issue_id: Uuid,
    /// The related issue.
    pub related_issue_id: Uuid,
    /// The type of relationship.
    pub relationship_type: IssueRelationshipType,
}

/// Request to update an existing issue relationship (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueRelationshipRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub related_issue_id: Option<Uuid>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub relationship_type: Option<IssueRelationshipType>,
}

/// Query parameters for listing issue relationships.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueRelationshipsQuery {
    pub issue_id: Uuid,
}
