use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Type;
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS)]
#[sqlx(type_name = "notification_type", rename_all = "snake_case")]
pub enum NotificationType {
    IssueCommentAdded,
    IssueStatusChanged,
    IssueAssigneeChanged,
    IssueDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Notification {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub notification_type: NotificationType,
    pub payload: Value,
    pub issue_id: Option<Uuid>,
    pub comment_id: Option<Uuid>,
    pub seen: bool,
    pub dismissed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateNotificationRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub organization_id: Uuid,
    pub seen: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateNotificationRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub seen: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListNotificationsQuery {
    pub organization_id: Uuid,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct ListNotificationsResponse {
    pub notifications: Vec<Notification>,
}
