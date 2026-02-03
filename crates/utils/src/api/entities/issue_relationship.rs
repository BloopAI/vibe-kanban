//! IssueRelationship entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;
use crate::api::types::IssueRelationshipType;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueRelationshipRequest {
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub related_issue_id: Uuid,
    pub relationship_type: IssueRelationshipType,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueRelationshipRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub related_issue_id: Option<Uuid>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub relationship_type: Option<IssueRelationshipType>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueRelationshipsQuery {
    pub issue_id: Uuid,
}
