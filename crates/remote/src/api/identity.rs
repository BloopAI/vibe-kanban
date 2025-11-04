use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct IdentityResponse {
    pub user_id: String,
    pub username: Option<String>,
    pub email: String,
}
