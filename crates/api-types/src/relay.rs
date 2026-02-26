use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
pub struct RelayHost {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub name: String,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub agent_version: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub access_role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListRelayHostsResponse {
    pub hosts: Vec<RelayHost>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RelaySessionAuthCodeResponse {
    pub session_id: Uuid,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
pub struct RelaySession {
    pub id: Uuid,
    pub host_id: Uuid,
    pub request_user_id: Uuid,
    pub state: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub claimed_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
}
