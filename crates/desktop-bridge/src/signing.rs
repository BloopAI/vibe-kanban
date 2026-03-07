//! Ed25519 request signing for relay proxy authentication.
//!
//! Matches the browser's signing format defined in
//! `packages/remote-web/src/shared/lib/relay/signing.ts`.

use anyhow::Context as _;
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD},
};
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

const SIGNING_SESSION_PARAM: &str = "x-vk-sig-session";
const TIMESTAMP_PARAM: &str = "x-vk-sig-ts";
const NONCE_PARAM: &str = "x-vk-sig-nonce";
const SIGNATURE_PARAM: &str = "x-vk-sig-signature";

/// Ed25519 signing context received from the browser.
#[derive(Clone)]
pub struct SigningContext {
    pub signing_session_id: String,
    pub signing_key: SigningKey,
}

impl SigningContext {
    /// Parse from a JWK private key (Ed25519, OKP curve).
    pub fn from_jwk(signing_session_id: String, jwk: &serde_json::Value) -> anyhow::Result<Self> {
        let d = jwk
            .get("d")
            .and_then(|v| v.as_str())
            .context("JWK missing 'd' field")?;

        let key_bytes = URL_SAFE_NO_PAD
            .decode(d)
            .context("Failed to decode JWK 'd' field")?;

        let key_array: [u8; 32] = key_bytes.try_into().map_err(|v: Vec<u8>| {
            anyhow::anyhow!("Ed25519 key must be 32 bytes, got {}", v.len())
        })?;

        let signing_key = SigningKey::from_bytes(&key_array);

        Ok(Self {
            signing_session_id,
            signing_key,
        })
    }
}

/// Append Ed25519 signature query params to a path, matching the browser's
/// `appendSignatureToPath()` in `relay/signing.ts`.
pub fn sign_path(ctx: &SigningContext, method: &str, path_and_query: &str) -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let body_hash = BASE64_STANDARD.encode(Sha256::digest(b""));

    let message = format!(
        "v1|{timestamp}|{method}|{path_and_query}|{signing_session_id}|{nonce}|{body_hash}",
        signing_session_id = ctx.signing_session_id,
    );

    let signature = ctx.signing_key.sign(message.as_bytes());
    let signature_b64 = BASE64_STANDARD.encode(signature.to_bytes());

    let separator = if path_and_query.contains('?') {
        '&'
    } else {
        '?'
    };

    format!(
        "{path_and_query}{separator}{SIGNING_SESSION_PARAM}={session}&{TIMESTAMP_PARAM}={timestamp}&{NONCE_PARAM}={nonce}&{SIGNATURE_PARAM}={sig}",
        session = ctx.signing_session_id,
        sig = urlencoding(&signature_b64),
    )
}

fn urlencoding(s: &str) -> String {
    s.replace('+', "%2B")
        .replace('/', "%2F")
        .replace('=', "%3D")
}
