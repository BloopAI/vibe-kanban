use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Type;
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS, JsonSchema)]
#[sqlx(type_name = "issue_relationship_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum IssueRelationshipType {
    Blocking,
    Related,
    HasDuplicate,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct IssueRelationship {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub related_issue_id: Uuid,
    pub relationship_type: IssueRelationshipType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateIssueRelationshipRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListIssueRelationshipsResponse {
    pub issue_relationships: Vec<IssueRelationship>,
}
