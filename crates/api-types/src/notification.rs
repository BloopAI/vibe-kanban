use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Type;
use ts_rs::TS;
use uuid::Uuid;

use crate::{IssuePriority, some_if_present};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "notification_type", rename_all = "snake_case")]
pub enum NotificationType {
    IssueCommentAdded,
    IssueStatusChanged,
    IssueAssigneeChanged,
    IssuePriorityChanged,
    IssueUnassigned,
    IssueCommentReaction,
    IssueDeleted,
    IssueTitleChanged,
    IssueDescriptionChanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum NotificationGroupKind {
    Single,
    IssueChanges,
    StatusChanges,
    Comments,
    Reactions,
    IssueDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Notification {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub notification_type: NotificationType,
    pub payload: NotificationPayload,
    pub issue_id: Option<Uuid>,
    pub comment_id: Option<Uuid>,
    pub seen: bool,
    pub dismissed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct NotificationPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deeplink_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_simple_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_user_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment_preview: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_status_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_status_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_status_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_status_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_priority: Option<IssuePriority>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_priority: Option<IssuePriority>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assignee_user_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateNotificationRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub seen: Option<bool>,
}
