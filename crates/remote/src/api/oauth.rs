use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderProfile {
    pub provider: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfileResponse {
    pub user_id: String,
    pub username: Option<String>,
    pub email: String,
    pub organization_id: String,
    pub providers: Vec<ProviderProfile>,
}
