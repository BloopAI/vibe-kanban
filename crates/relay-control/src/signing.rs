use std::{
    collections::HashMap,
    fs, io,
    path::Path,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use tokio::sync::{RwLock, RwLockMappedWriteGuard, RwLockWriteGuard};
use uuid::Uuid;

struct RelaySigningSession {
    browser_public_key: VerifyingKey,
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
    server_signing_key: Arc<SigningKey>,
}

impl RelaySigningService {
    pub fn new(server_signing_key: SigningKey) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            server_signing_key: Arc::new(server_signing_key),
        }
    }

    pub fn load_or_generate(key_path: &Path) -> io::Result<Self> {
        let key = if let Ok(bytes) = fs::read(key_path) {
            let arr: [u8; 32] = bytes.try_into().map_err(|_| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    "server signing key file has invalid length (expected 32 bytes)",
                )
            })?;
            SigningKey::from_bytes(&arr)
        } else {
            let key = SigningKey::generate(&mut OsRng);

            if let Some(parent) = key_path.parent() {
                fs::create_dir_all(parent)?;
            }

            let tmp = key_path.with_extension("tmp");
            fs::write(&tmp, key.to_bytes())?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
            }

            fs::rename(&tmp, key_path)?;
            key
        };

        Ok(Self::new(key))
    }

    pub fn server_public_key(&self) -> VerifyingKey {
        self.server_signing_key.verifying_key()
    }

    pub async fn create_session(&self, browser_public_key: VerifyingKey) -> Uuid {
        let signing_session_id = Uuid::new_v4();
        let now = Instant::now();
        let mut sessions = self.sessions.write().await;
        sessions.insert(
            signing_session_id,
            RelaySigningSession {
                browser_public_key,
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
        let mut session = self.get_valid_session(signing_session_id).await?;

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
        let mut session = self.get_valid_session(signing_session_id).await?;
        session.last_used_at = Instant::now();

        let signature = self.server_signing_key.sign(message);
        Ok(BASE64_STANDARD.encode(signature.to_bytes()))
    }

    pub async fn verify_signature(
        &self,
        signing_session_id: Uuid,
        message: &[u8],
        signature_b64: &str,
    ) -> Result<(), RelaySignatureValidationError> {
        let signature = parse_signature_b64(signature_b64)?;
        let mut session = self.get_valid_session(signing_session_id).await?;

        session
            .browser_public_key
            .verify(message, &signature)
            .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;

        session.last_used_at = Instant::now();
        Ok(())
    }

    async fn get_valid_session(
        &self,
        signing_session_id: Uuid,
    ) -> Result<RwLockMappedWriteGuard<'_, RelaySigningSession>, RelaySignatureValidationError>
    {
        let mut sessions = self.sessions.write().await;
        let now = Instant::now();
        sessions.retain(|_, session| {
            now.duration_since(session.created_at) <= RELAY_SIGNING_SESSION_TTL
                && now.duration_since(session.last_used_at) <= RELAY_SIGNING_SESSION_IDLE_TTL
        });
        RwLockWriteGuard::try_map(sessions, |sessions| sessions.get_mut(&signing_session_id))
            .map_err(|_| RelaySignatureValidationError::MissingSigningSession)
    }
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
