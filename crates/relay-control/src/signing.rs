use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use tokio::sync::RwLock;
use uuid::Uuid;

struct RelaySigningSession {
    browser_public_key: VerifyingKey,
    server_signing_key: SigningKey,
    created_at: Instant,
    last_used_at: Instant,
    seen_nonces: HashMap<String, Instant>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelaySignatureValidationError {
    TimestampOutOfDrift,
    MissingSigningSession,
    InvalidNonce,
    ReplayNonce,
    InvalidSignature,
}

impl RelaySignatureValidationError {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TimestampOutOfDrift => "timestamp outside drift window",
            Self::MissingSigningSession => "missing or expired signing session",
            Self::InvalidNonce => "invalid nonce",
            Self::ReplayNonce => "replayed nonce",
            Self::InvalidSignature => "invalid signature",
        }
    }
}

const RELAY_SIGNATURE_MAX_TIMESTAMP_DRIFT_SECS: i64 = 30;
const RELAY_SIGNING_SESSION_TTL: Duration = Duration::from_secs(60 * 60);
const RELAY_SIGNING_SESSION_IDLE_TTL: Duration = Duration::from_secs(15 * 60);
const RELAY_NONCE_TTL: Duration = Duration::from_secs(2 * 60);

#[derive(Clone)]
pub struct RelaySigningService {
    sessions: Arc<RwLock<HashMap<Uuid, RelaySigningSession>>>,
}

impl RelaySigningService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        browser_public_key: VerifyingKey,
        server_signing_key: SigningKey,
    ) -> Uuid {
        let signing_session_id = Uuid::new_v4();
        let now = Instant::now();
        let mut sessions = self.sessions.write().await;
        sessions.insert(
            signing_session_id,
            RelaySigningSession {
                browser_public_key,
                server_signing_key,
                created_at: now,
                last_used_at: now,
                seen_nonces: HashMap::new(),
            },
        );
        signing_session_id
    }

    pub async fn verify_message(
        &self,
        signing_session_id: Uuid,
        timestamp: i64,
        nonce: &str,
        message: &[u8],
        signature_b64: &str,
    ) -> Result<(), RelaySignatureValidationError> {
        if nonce.trim().is_empty() || nonce.len() > 128 {
            return Err(RelaySignatureValidationError::InvalidNonce);
        }

        validate_timestamp(timestamp)?;

        let signature = parse_signature_b64(signature_b64)?;
        let mut sessions = self.sessions.write().await;
        let session = get_valid_session(&mut sessions, signing_session_id)?;

        session
            .seen_nonces
            .retain(|_, seen_at| Instant::now().duration_since(*seen_at) <= RELAY_NONCE_TTL);
        if session.seen_nonces.contains_key(nonce) {
            return Err(RelaySignatureValidationError::ReplayNonce);
        }

        session
            .browser_public_key
            .verify(message, &signature)
            .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;

        session
            .seen_nonces
            .insert(nonce.to_string(), Instant::now());
        session.last_used_at = Instant::now();

        Ok(())
    }

    pub async fn sign_message(
        &self,
        signing_session_id: Uuid,
        message: &[u8],
    ) -> Result<String, RelaySignatureValidationError> {
        let mut sessions = self.sessions.write().await;
        let session = get_valid_session(&mut sessions, signing_session_id)?;
        session.last_used_at = Instant::now();

        let signature = session.server_signing_key.sign(message);
        Ok(BASE64_STANDARD.encode(signature.to_bytes()))
    }

    pub async fn verify_signature(
        &self,
        signing_session_id: Uuid,
        message: &[u8],
        signature_b64: &str,
    ) -> Result<(), RelaySignatureValidationError> {
        let signature = parse_signature_b64(signature_b64)?;
        let mut sessions = self.sessions.write().await;
        let session = get_valid_session(&mut sessions, signing_session_id)?;

        session
            .browser_public_key
            .verify(message, &signature)
            .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;

        session.last_used_at = Instant::now();
        Ok(())
    }
}

fn get_valid_session(
    sessions: &mut HashMap<Uuid, RelaySigningSession>,
    signing_session_id: Uuid,
) -> Result<&mut RelaySigningSession, RelaySignatureValidationError> {
    let now = Instant::now();
    sessions.retain(|_, session| {
        now.duration_since(session.created_at) <= RELAY_SIGNING_SESSION_TTL
            && now.duration_since(session.last_used_at) <= RELAY_SIGNING_SESSION_IDLE_TTL
    });
    sessions
        .get_mut(&signing_session_id)
        .ok_or(RelaySignatureValidationError::MissingSigningSession)
}

fn validate_timestamp(timestamp: i64) -> Result<(), RelaySignatureValidationError> {
    let now_secs = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| RelaySignatureValidationError::TimestampOutOfDrift)?
            .as_secs(),
    )
    .map_err(|_| RelaySignatureValidationError::TimestampOutOfDrift)?;

    let drift_secs = now_secs.saturating_sub(timestamp).abs();
    if drift_secs > RELAY_SIGNATURE_MAX_TIMESTAMP_DRIFT_SECS {
        return Err(RelaySignatureValidationError::TimestampOutOfDrift);
    }
    Ok(())
}

fn parse_signature_b64(signature_b64: &str) -> Result<Signature, RelaySignatureValidationError> {
    let sig_bytes = BASE64_STANDARD
        .decode(signature_b64)
        .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;
    Signature::from_slice(&sig_bytes).map_err(|_| RelaySignatureValidationError::InvalidSignature)
}
