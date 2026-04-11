use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
pub struct RelayHost {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub machine_id: String,
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
pub struct CreateRemoteSessionResponse {
    pub session_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct RemoteSession {
    pub host_id: Uuid,
    pub id: Uuid,
}

#[derive(Debug, Clone)]
pub struct RelayAuthState {
    pub remote_session: RemoteSession,
    pub signing_session_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StartSpake2EnrollmentRequest {
    pub enrollment_code: String,
    pub client_message_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StartSpake2EnrollmentResponse {
    pub enrollment_id: Uuid,
    pub server_message_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FinishSpake2EnrollmentRequest {
    pub enrollment_id: Uuid,
    pub client_id: Uuid,
    pub client_name: String,
    pub client_browser: String,
    pub client_os: String,
    pub client_device: String,
    pub public_key_b64: String,
    pub client_proof_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FinishSpake2EnrollmentResponse {
    pub signing_session_id: Uuid,
    pub server_public_key_b64: String,
    pub server_proof_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RefreshRelaySigningSessionRequest {
    pub client_id: Uuid,
    pub timestamp: i64,
    pub nonce: String,
    pub signature_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RefreshRelaySigningSessionResponse {
    pub signing_session_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PairRelayHostRequest {
    pub host_id: Uuid,
    pub host_name: String,
    pub enrollment_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PairRelayHostResponse {
    pub paired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RelayPairedHost {
    pub host_id: Uuid,
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListRelayPairedHostsResponse {
    pub hosts: Vec<RelayPairedHost>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RemoveRelayPairedHostResponse {
    pub removed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RelayPairedClient {
    pub client_id: Uuid,
    pub client_name: String,
    pub client_browser: String,
    pub client_os: String,
    pub client_device: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListRelayPairedClientsResponse {
    pub clients: Vec<RelayPairedClient>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RemoveRelayPairedClientResponse {
    pub removed: bool,
}
