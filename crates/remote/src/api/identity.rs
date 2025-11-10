use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct IdentityResponse {
    pub user_id: Uuid,
    pub username: Option<String>,
    pub email: String,
}
