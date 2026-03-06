use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StartSpake2EnrollmentRequest {
    pub(crate) enrollment_code: String,
    pub(crate) client_message_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StartSpake2EnrollmentResponse {
    pub(crate) enrollment_id: Uuid,
    pub(crate) server_message_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FinishSpake2EnrollmentRequest {
    pub(crate) enrollment_id: Uuid,
    pub(crate) client_id: Uuid,
    pub(crate) client_name: String,
    pub(crate) client_browser: String,
    pub(crate) client_os: String,
    pub(crate) client_device: String,
    pub(crate) public_key_b64: String,
    pub(crate) client_proof_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FinishSpake2EnrollmentResponse {
    pub(crate) signing_session_id: Uuid,
    pub(crate) server_public_key_b64: String,
    pub(crate) server_proof_b64: String,
}
