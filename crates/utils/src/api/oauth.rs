use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceInitRequest {
    pub provider: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceInitResponse {
    pub verification_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri_complete: Option<String>,
    pub user_code: String,
    pub handoff_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevicePollRequest {
    pub handoff_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevicePollResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderProfile {
    pub provider: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileResponse {
    pub user_id: String,
    pub username: Option<String>,
    pub email: String,
    pub organization_id: String,
    pub providers: Vec<ProviderProfile>,
}
