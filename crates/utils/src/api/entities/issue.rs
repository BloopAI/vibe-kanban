//! Issue entity request types.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;
use crate::api::types::IssuePriority;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueRequest {
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

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub status_id: Option<Uuid>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub title: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub priority: Option<Option<IssuePriority>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub start_date: Option<Option<DateTime<Utc>>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub target_date: Option<Option<DateTime<Utc>>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub completed_at: Option<Option<DateTime<Utc>>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub sort_order: Option<f64>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub parent_issue_id: Option<Option<Uuid>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub parent_issue_sort_order: Option<Option<f64>>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub extension_metadata: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssuesQuery {
    pub project_id: Uuid,
}
