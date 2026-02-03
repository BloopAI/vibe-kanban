//! Issue entity request types.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;
use crate::api::types::IssuePriority;

/// Request to create a new issue.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CreateIssueRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The project this issue belongs to.
    pub project_id: Uuid,
    /// The status ID for this issue.
    pub status_id: Uuid,
    /// Issue title.
    pub title: String,
    /// Issue description (markdown).
    pub description: Option<String>,
    /// Issue priority level.
    pub priority: Option<IssuePriority>,
    /// When work should start.
    pub start_date: Option<DateTime<Utc>>,
    /// Target completion date.
    pub target_date: Option<DateTime<Utc>>,
    /// When the issue was completed.
    pub completed_at: Option<DateTime<Utc>>,
    /// Sort order within the status column.
    pub sort_order: f64,
    /// Parent issue ID for sub-issues.
    pub parent_issue_id: Option<Uuid>,
    /// Sort order within the parent issue's children.
    pub parent_issue_sort_order: Option<f64>,
    /// Extension metadata for custom fields.
    pub extension_metadata: Value,
}

/// Request to update an existing issue (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
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

/// Query parameters for listing issues.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssuesQuery {
    pub project_id: Uuid,
}
