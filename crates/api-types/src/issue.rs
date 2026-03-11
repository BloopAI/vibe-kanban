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

impl IssuePriority {
    fn as_query_value(self) -> &'static str {
        match self {
            Self::Urgent => "urgent",
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::FromRow)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum IssueSortField {
    SortOrder,
    Priority,
    CreatedAt,
    UpdatedAt,
    Title,
}

impl IssueSortField {
    fn as_query_value(self) -> &'static str {
        match self {
            Self::SortOrder => "sort_order",
            Self::Priority => "priority",
            Self::CreatedAt => "created_at",
            Self::UpdatedAt => "updated_at",
            Self::Title => "title",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SortDirection {
    Asc,
    Desc,
}

impl SortDirection {
    fn as_query_value(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListIssuesQuery {
    pub project_id: Uuid,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_id: Option<Uuid>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_ids: Option<Vec<Uuid>>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<IssuePriority>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_issue_id: Option<Uuid>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub simple_id: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_user_id: Option<Uuid>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_id: Option<Uuid>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_ids: Option<Vec<Uuid>>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_field: Option<IssueSortField>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_direction: Option<SortDirection>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i32>,
}

impl ListIssuesQuery {
    pub fn to_query_pairs(&self) -> Vec<(String, String)> {
        let mut pairs = vec![("project_id".to_string(), self.project_id.to_string())];

        if let Some(status_id) = self.status_id {
            pairs.push(("status_id".to_string(), status_id.to_string()));
        }

        if let Some(status_ids) = &self.status_ids {
            pairs.extend(
                status_ids
                    .iter()
                    .map(|status_id| ("status_ids".to_string(), status_id.to_string())),
            );
        }

        if let Some(priority) = self.priority {
            pairs.push((
                "priority".to_string(),
                priority.as_query_value().to_string(),
            ));
        }

        if let Some(parent_issue_id) = self.parent_issue_id {
            pairs.push(("parent_issue_id".to_string(), parent_issue_id.to_string()));
        }

        if let Some(search) = &self.search {
            pairs.push(("search".to_string(), search.clone()));
        }

        if let Some(simple_id) = &self.simple_id {
            pairs.push(("simple_id".to_string(), simple_id.clone()));
        }

        if let Some(assignee_user_id) = self.assignee_user_id {
            pairs.push(("assignee_user_id".to_string(), assignee_user_id.to_string()));
        }

        if let Some(tag_id) = self.tag_id {
            pairs.push(("tag_id".to_string(), tag_id.to_string()));
        }

        if let Some(tag_ids) = &self.tag_ids {
            pairs.extend(
                tag_ids
                    .iter()
                    .map(|tag_id| ("tag_ids".to_string(), tag_id.to_string())),
            );
        }

        if let Some(sort_field) = self.sort_field {
            pairs.push((
                "sort_field".to_string(),
                sort_field.as_query_value().to_string(),
            ));
        }

        if let Some(sort_direction) = self.sort_direction {
            pairs.push((
                "sort_direction".to_string(),
                sort_direction.as_query_value().to_string(),
            ));
        }

        if let Some(limit) = self.limit {
            pairs.push(("limit".to_string(), limit.to_string()));
        }

        if let Some(offset) = self.offset {
            pairs.push(("offset".to_string(), offset.to_string()));
        }

        pairs
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListIssuesResponse {
    pub issues: Vec<Issue>,
    pub total_count: usize,
    pub limit: usize,
    pub offset: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_issues_query_serializes_multi_value_filters_as_repeated_pairs() {
        let first_status_id = Uuid::new_v4();
        let second_status_id = Uuid::new_v4();
        let tag_id = Uuid::new_v4();
        let assignee_user_id = Uuid::new_v4();

        let query = ListIssuesQuery {
            project_id: Uuid::new_v4(),
            status_id: None,
            status_ids: Some(vec![first_status_id, second_status_id]),
            priority: Some(IssuePriority::High),
            parent_issue_id: None,
            search: Some("done".to_string()),
            simple_id: None,
            assignee_user_id: Some(assignee_user_id),
            tag_id: None,
            tag_ids: Some(vec![tag_id]),
            sort_field: Some(IssueSortField::SortOrder),
            sort_direction: Some(SortDirection::Asc),
            limit: Some(200),
            offset: Some(0),
        };

        let pairs = query.to_query_pairs();

        assert!(pairs.contains(&("status_ids".to_string(), first_status_id.to_string())));
        assert!(pairs.contains(&("status_ids".to_string(), second_status_id.to_string())));
        assert!(pairs.contains(&("tag_ids".to_string(), tag_id.to_string())));
        assert!(pairs.contains(&("priority".to_string(), "high".to_string())));
        assert!(pairs.contains(&("assignee_user_id".to_string(), assignee_user_id.to_string())));
        assert!(pairs.contains(&("sort_field".to_string(), "sort_order".to_string())));
        assert!(pairs.contains(&("sort_direction".to_string(), "asc".to_string())));
        assert!(pairs.contains(&("limit".to_string(), "200".to_string())));
    }
}
