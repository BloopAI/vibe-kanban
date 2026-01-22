use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[sqlx(type_name = "issue_priority", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum IssuePriority {
    Urgent,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[sqlx(type_name = "workspace_pr_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum WorkspacePrStatus {
    Open,
    Merged,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[sqlx(type_name = "issue_relationship_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum IssueRelationshipType {
    Blocking,
    Related,
    HasDuplicate,
}
