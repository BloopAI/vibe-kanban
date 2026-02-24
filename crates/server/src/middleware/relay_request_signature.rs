use axum::{
    extract::{OriginalUri, Request, State},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const RELAY_HEADER: &str = "x-vk-relayed";
const SIGNING_SESSION_HEADER: &str = "x-vk-sig-session";
const TIMESTAMP_HEADER: &str = "x-vk-sig-ts";
const NONCE_HEADER: &str = "x-vk-sig-nonce";
const SIGNATURE_HEADER: &str = "x-vk-signature";

pub async fn require_relay_request_signature(
    State(deployment): State<DeploymentImpl>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if !is_relay_request(&request) {
        return Ok(next.run(request).await);
    }

    let path_and_query = request_path_and_query(&request);
    if path_and_query.starts_with("/api/relay-auth/") {
        return Ok(next.run(request).await);
    }

    let signing_session_id = required_header(&request, SIGNING_SESSION_HEADER)
        .ok_or(ApiError::Unauthorized)
        .and_then(|value| Uuid::parse_str(value).map_err(|_| ApiError::Unauthorized))?;
    let timestamp = required_header(&request, TIMESTAMP_HEADER)
        .ok_or(ApiError::Unauthorized)
        .and_then(|value| value.parse::<i64>().map_err(|_| ApiError::Unauthorized))?;
    let nonce = required_header(&request, NONCE_HEADER).ok_or(ApiError::Unauthorized)?;
    let signature_b64 =
        required_header(&request, SIGNATURE_HEADER).ok_or(ApiError::Unauthorized)?;

    let message = build_signed_message(
        timestamp,
        request.method().as_str(),
        &path_and_query,
        &signing_session_id,
        nonce,
    );

    if let Err(error) = deployment
        .verify_relay_request_signature(
            signing_session_id,
            timestamp,
            nonce,
            &message,
            signature_b64,
        )
        .await
    {
        tracing::warn!(
            signing_session_id = %signing_session_id,
            path = %path_and_query,
            reason = %error.as_str(),
            "rejecting relay request with invalid signature"
        );
        return Err(ApiError::Unauthorized);
    }

    Ok(next.run(request).await)
}

fn build_signed_message(
    timestamp: i64,
    method: &str,
    path_and_query: &str,
    signing_session_id: &Uuid,
    nonce: &str,
) -> String {
    format!("{timestamp}.{method}.{path_and_query}.{signing_session_id}.{nonce}")
}

fn request_path_and_query(request: &Request) -> String {
    let raw = if let Some(original_uri) = request.extensions().get::<OriginalUri>() {
        if let Some(path_and_query) = original_uri.0.path_and_query() {
            path_and_query.as_str().to_string()
        } else {
            original_uri.0.path().to_string()
        }
    } else {
        request
            .uri()
            .path_and_query()
            .map(|value| value.as_str().to_string())
            .unwrap_or_else(|| request.uri().path().to_string())
    };

    if raw.starts_with("/api/") {
        raw
    } else if raw.starts_with('/') {
        format!("/api{raw}")
    } else {
        format!("/api/{raw}")
    }
}

fn required_header<'a>(request: &'a Request, name: &'static str) -> Option<&'a str> {
    request
        .headers()
        .get(name)?
        .to_str()
        .ok()
        .and_then(|value| {
            let value = value.trim();
            if value.is_empty() { None } else { Some(value) }
        })
}

fn is_relay_request(request: &Request) -> bool {
    request
        .headers()
        .get(RELAY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.trim() == "1")
}
