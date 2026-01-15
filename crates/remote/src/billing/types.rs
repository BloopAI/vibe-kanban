use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum BillingStatus {
    Free,
    Active,
    PastDue,
    Cancelled,
    RequiresSubscription,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SeatInfo {
    pub current_members: u32,
    pub free_seats: u32,
    pub requires_subscription: bool,
    pub subscription: Option<SubscriptionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SubscriptionInfo {
    pub status: String,
    pub current_period_end: DateTime<Utc>,
    pub cancel_at_period_end: bool,
    pub quantity: u32,
    pub unit_amount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BillingStatusResponse {
    pub status: BillingStatus,
    pub billing_enabled: bool,
    pub seat_info: Option<SeatInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerPortalSession {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckoutSession {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateCheckoutRequest {
    pub success_url: String,
    pub cancel_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreatePortalRequest {
    pub return_url: String,
}
