//! Notification entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateNotificationRequest {
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
