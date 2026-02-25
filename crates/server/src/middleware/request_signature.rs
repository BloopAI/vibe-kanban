use axum::{
    extract::{OriginalUri, Request},
    middleware::Next,
    response::Response,
};
use tracing::{debug, info};
use trusted_key_auth::{
    TRUSTED_KEYS_FILE_NAME,
    request_signature::{
        MAX_TIMESTAMP_DRIFT_SECONDS, SignatureVerificationError, verify_trusted_ed25519_signature,
    },
};
use utils::assets::asset_dir;

use crate::error::ApiError;

pub async fn require_trusted_ed25519_signature(
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let request_path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|uri| uri.0.path())
        .unwrap_or_else(|| request.uri().path())
        .to_string();
    let request_method = request.method().as_str().to_string();
    let trusted_keys_path = asset_dir().join(TRUSTED_KEYS_FILE_NAME);

    let verification = match verify_trusted_ed25519_signature(
        request.headers(),
        request.method(),
        &request_path,
        &trusted_keys_path,
    )
    .await
    {
        Ok(verification) => verification,
        Err(error) => {
            log_signature_rejection(&request_method, &request_path, error);
            return Err(ApiError::Unauthorized);
        }
    };

    debug!(
        method = %request_method,
        path = %request_path,
        timestamp = verification.timestamp,
        now = verification.now,
        drift_seconds = verification.drift_seconds,
        max_drift_seconds = MAX_TIMESTAMP_DRIFT_SECONDS,
        "Parsed signature timestamp"
    );
    debug!(
        method = %request_method,
        path = %request_path,
        trusted_key_count = verification.trusted_key_count,
        "Loaded trusted Ed25519 keys"
    );

    info!(
        method = %request_method,
        path = %request_path,
        "Accepted signed request"
    );
    Ok(next.run(request).await)
}

fn log_signature_rejection(method: &str, path: &str, error: SignatureVerificationError) {
    match error {
        SignatureVerificationError::InvalidTimestampHeader => {
            info!(
                method,
                path, "Rejecting signed request: missing or invalid x-vk-timestamp header"
            );
        }
        SignatureVerificationError::ClockUnavailable => {
            info!(
                method,
                path, "Rejecting signed request: failed to read system clock"
            );
        }
        SignatureVerificationError::TimestampOutOfDrift {
            timestamp,
            now,
            drift_seconds,
            max_drift_seconds,
        } => {
            info!(
                method,
                path,
                timestamp,
                now,
                drift_seconds,
                max_drift_seconds,
                "Rejecting signed request: timestamp is outside allowed drift"
            );
        }
        SignatureVerificationError::InvalidSignatureHeader => {
            info!(
                method,
                path, "Rejecting signed request: missing or invalid x-vk-signature header"
            );
        }
        SignatureVerificationError::TrustedKeysUnavailable => {
            info!(
                method,
                path, "Rejecting signed request: failed to load trusted Ed25519 public keys"
            );
        }
        SignatureVerificationError::SignatureMismatch { trusted_key_count } => {
            info!(
                method,
                path,
                trusted_key_count,
                "Rejecting signed request: signature does not match any trusted key"
            );
        }
    }
}
