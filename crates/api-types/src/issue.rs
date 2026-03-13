use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Type;
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS)]
#[sqlx(type_name = "issue_priority", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum IssuePriority {
    Urgent,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Issue {
    pub id: Uuid,
    pub project_id: Uuid,
    pub issue_number: i32,
    pub simple_id: String,
    pub status_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<IssuePriority>,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub sort_order: f64,
    pub parent_issue_id: Option<Uuid>,
    pub parent_issue_sort_order: Option<f64>,
    pub extension_metadata: Value,
    pub creator_user_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateIssueRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub status_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<IssuePriority>,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub sort_order: f64,
    pub parent_issue_id: Option<Uuid>,
    pub parent_issue_sort_order: Option<f64>,
    pub extension_metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpdateIssueRequest {
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub status_id: Option<Uuid>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub title: Option<String>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: Option<Option<String>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub priority: Option<Option<IssuePriority>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub start_date: Option<Option<DateTime<Utc>>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub target_date: Option<Option<DateTime<Utc>>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub completed_at: Option<Option<DateTime<Utc>>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub sort_order: Option<f64>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub parent_issue_id: Option<Option<Uuid>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub parent_issue_sort_order: Option<Option<f64>>,
    #[serde(
        default,
        deserialize_with = "some_if_present",
        skip_serializing_if = "Option::is_none"
    )]
    pub extension_metadata: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssuesQuery {
    pub project_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListIssuesResponse {
    pub issues: Vec<Issue>,
}
