//! Notification entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new notification.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateNotificationRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The organization this notification belongs to.
    pub organization_id: Uuid,
    /// Whether the notification has been seen.
    pub seen: bool,
}

/// Request to update an existing notification (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateNotificationRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub seen: Option<bool>,
}

/// Query parameters for listing notifications.
#[derive(Debug, Clone, Deserialize)]
pub struct ListNotificationsQuery {
    pub organization_id: Uuid,
}
