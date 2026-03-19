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
use sha2::{Digest, Sha256};
use tokio::sync::{RwLock, RwLockMappedWriteGuard, RwLockWriteGuard};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Request signing — used by local proxy and tunnel to sign outbound requests
// ---------------------------------------------------------------------------

pub const SIGNING_SESSION_HEADER: &str = "x-vk-sig-session";
pub const TIMESTAMP_HEADER: &str = "x-vk-sig-ts";
pub const NONCE_HEADER: &str = "x-vk-sig-nonce";
pub const REQUEST_SIGNATURE_HEADER: &str = "x-vk-sig-signature";

#[derive(Debug, Clone)]
pub struct RequestSignature {
    pub signing_session_id: Uuid,
    pub timestamp: i64,
    pub nonce: Uuid,
    pub signature_b64: String,
}

fn build_request_signing_message(
    sig: &RequestSignature,
    method: &str,
    path_and_query: &str,
    body: &[u8],
) -> String {
    let body_hash = BASE64_STANDARD.encode(Sha256::digest(body));
    format!(
        "v1|{}|{method}|{path_and_query}|{}|{}|{body_hash}",
        sig.timestamp, sig.signing_session_id, sig.nonce
    )
}

fn build_request_signature(
    signing_key: &SigningKey,
    signing_session_id: Uuid,
    method: &str,
    path_and_query: &str,
    body: &[u8],
) -> RequestSignature {
    let mut sig = RequestSignature {
        signing_session_id,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        nonce: Uuid::new_v4(),
        signature_b64: String::new(),
    };
    let message = build_request_signing_message(&sig, method, path_and_query, body);
    sig.signature_b64 = BASE64_STANDARD.encode(signing_key.sign(message.as_bytes()).to_bytes());
    sig
}

// ---------------------------------------------------------------------------
// Response signing — used by relay_request_signature middleware
// ---------------------------------------------------------------------------

pub const RESPONSE_TIMESTAMP_HEADER: &str = "x-vk-resp-ts";
pub const RESPONSE_NONCE_HEADER: &str = "x-vk-resp-nonce";
pub const RESPONSE_SIGNATURE_HEADER: &str = "x-vk-resp-signature";

/// Build the canonical signing message for an HTTP response.
pub fn build_response_signing_message(
    timestamp: i64,
    status: u16,
    path_and_query: &str,
    signing_session_id: Uuid,
    request_nonce: Uuid,
    response_nonce: Uuid,
    body: &[u8],
) -> String {
    let body_hash = BASE64_STANDARD.encode(Sha256::digest(body));
    format!(
        "v1|{timestamp}|{status}|{path_and_query}|{signing_session_id}|{request_nonce}|{response_nonce}|{body_hash}"
    )
}

// ---------------------------------------------------------------------------
// Session management — server-side verification of signed requests
// ---------------------------------------------------------------------------

struct RelaySigningSession {
    peer_public_key: VerifyingKey,
    created_at: Instant,
    last_used_at: Instant,
    seen_nonces: HashMap<Uuid, Instant>,
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

    pub fn signing_key(&self) -> &SigningKey {
        &self.server_signing_key
    }

    /// Sign an HTTP request for relay proxy authentication.
    pub fn sign_request(
        &self,
        signing_session_id: Uuid,
        method: &str,
        path_and_query: &str,
        body: &[u8],
    ) -> RequestSignature {
        build_request_signature(
            &self.server_signing_key,
            signing_session_id,
            method,
            path_and_query,
            body,
        )
    }

    /// Raw Ed25519 signature over arbitrary bytes.
    pub fn sign_bytes(&self, message: &[u8]) -> Signature {
        self.server_signing_key.sign(message)
    }

    pub async fn create_session(&self, peer_public_key: VerifyingKey) -> Uuid {
        let signing_session_id = Uuid::new_v4();
        self.register_session(signing_session_id, peer_public_key)
            .await;
        signing_session_id
    }

    /// Register a signing session with a known peer public key.
    /// On the server this is called via `create_session`; on the client
    /// it is called after receiving a session ID from the server.
    pub async fn register_session(&self, signing_session_id: Uuid, peer_public_key: VerifyingKey) {
        let now = Instant::now();
        self.sessions.write().await.insert(
            signing_session_id,
            RelaySigningSession {
                peer_public_key,
                created_at: now,
                last_used_at: now,
                seen_nonces: HashMap::new(),
            },
        );
    }

    /// Verify an HTTP request signature against a signing session.
    pub async fn verify_request(
        &self,
        request_signature: &RequestSignature,
        method: &str,
        path_and_query: &str,
        body: &[u8],
    ) -> Result<(), RelaySignatureValidationError> {
        validate_timestamp(request_signature.timestamp)?;

        let signature = parse_signature_b64(&request_signature.signature_b64)?;
        let mut session = self
            .get_valid_session(request_signature.signing_session_id)
            .await?;

        session
            .seen_nonces
            .retain(|_, seen_at| Instant::now().duration_since(*seen_at) <= RELAY_NONCE_TTL);
        if session.seen_nonces.contains_key(&request_signature.nonce) {
            return Err(RelaySignatureValidationError::ReplayNonce);
        }

        let message =
            build_request_signing_message(request_signature, method, path_and_query, body);
        session
            .peer_public_key
            .verify(message.as_bytes(), &signature)
            .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;

        session
            .seen_nonces
            .insert(request_signature.nonce, Instant::now());
        session.last_used_at = Instant::now();

        Ok(())
    }

    /// Get the peer's public key for a valid signing session.
    pub async fn get_session_peer_key(&self, signing_session_id: Uuid) -> Option<VerifyingKey> {
        let sessions = self.sessions.read().await;
        let now = Instant::now();
        sessions.get(&signing_session_id).and_then(|session| {
            if now.duration_since(session.created_at) <= RELAY_SIGNING_SESSION_TTL
                && now.duration_since(session.last_used_at) <= RELAY_SIGNING_SESSION_IDLE_TTL
            {
                Some(session.peer_public_key)
            } else {
                None
            }
        })
    }

    /// Check if any active signing session has the given Ed25519 public key.
    /// Used by the embedded SSH server for public key authentication.
    pub async fn has_active_session_with_key(&self, key_bytes: &[u8; 32]) -> bool {
        let sessions = self.sessions.read().await;
        let now = Instant::now();
        sessions.values().any(|session| {
            now.duration_since(session.created_at) <= RELAY_SIGNING_SESSION_TTL
                && now.duration_since(session.last_used_at) <= RELAY_SIGNING_SESSION_IDLE_TTL
                && session.peer_public_key.as_bytes() == key_bytes
        })
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
