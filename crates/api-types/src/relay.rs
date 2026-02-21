use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRelayHostRequest {
    pub name: String,
    #[serde(default)]
    pub agent_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayHostRef {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListRelayHostsResponse {
    pub hosts: Vec<RelayHostRef>,
}
