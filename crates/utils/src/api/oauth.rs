use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct HandoffInitRequest {
    pub provider: String,
    pub return_to: String,
    pub app_challenge: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct HandoffInitResponse {
    pub handoff_id: Uuid,
    pub authorize_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct HandoffRedeemRequest {
    pub handoff_id: Uuid,
    pub app_code: String,
    pub app_verifier: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct HandoffRedeemResponse {
    pub access_token: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
pub struct ProviderProfile {
    pub provider: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
pub struct ProfileResponse {
    pub user_id: Uuid,
    pub username: Option<String>,
    pub email: String,
    pub providers: Vec<ProviderProfile>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum LoginStatus {
    LoggedOut,
    LoggedIn { profile: ProfileResponse },
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
pub struct StatusResponse {
    pub logged_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<ProfileResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degraded: Option<bool>,
}
