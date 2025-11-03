use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubTokenResponse {
    pub access_token: String,
    pub expires_at: Option<i64>,
    pub scopes: Vec<String>,
}
