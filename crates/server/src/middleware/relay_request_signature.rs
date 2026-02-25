use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::{Body, to_bytes},
    extract::{OriginalUri, Request, State},
    http::HeaderValue,
    middleware::Next,
    response::Response,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const RELAY_HEADER: &str = "x-vk-relayed";
const SIGNING_SESSION_HEADER: &str = "x-vk-sig-session";
const TIMESTAMP_HEADER: &str = "x-vk-sig-ts";
const NONCE_HEADER: &str = "x-vk-sig-nonce";
const BODY_HASH_HEADER: &str = "x-vk-sig-body-sha256";
const REQUEST_MAC_HEADER: &str = "x-vk-sig-mac";

const RESPONSE_TIMESTAMP_HEADER: &str = "x-vk-resp-ts";
const RESPONSE_NONCE_HEADER: &str = "x-vk-resp-nonce";
const RESPONSE_BODY_HASH_HEADER: &str = "x-vk-resp-body-sha256";
const RESPONSE_MAC_HEADER: &str = "x-vk-resp-mac";

const REQUEST_MAC_PURPOSE: &str = "relay-http-request-v1";
const RESPONSE_MAC_PURPOSE: &str = "relay-http-response-v1";

#[derive(Clone, Debug)]
pub struct RelayRequestSignatureContext {
    pub signing_session_id: Uuid,
    pub request_nonce: String,
}

pub async fn require_relay_request_signature(
    State(deployment): State<DeploymentImpl>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if !is_relay_request(&request) {
        return Ok(next.run(request).await);
    }

    let Some(path_and_query) = relay_signed_path_and_query(&request)? else {
        return Ok(next.run(request).await);
    };

    let signing_session_id = required_header(&request, SIGNING_SESSION_HEADER)
        .ok_or(ApiError::Unauthorized)
        .and_then(|value| Uuid::parse_str(value).map_err(|_| ApiError::Unauthorized))?;
    let timestamp = required_header(&request, TIMESTAMP_HEADER)
        .ok_or(ApiError::Unauthorized)
        .and_then(|value| value.parse::<i64>().map_err(|_| ApiError::Unauthorized))?;
    let nonce = required_header(&request, NONCE_HEADER)
        .ok_or(ApiError::Unauthorized)?
        .to_string();
    let provided_body_hash = required_header(&request, BODY_HASH_HEADER)
        .ok_or(ApiError::Unauthorized)?
        .to_string();
    let request_mac_b64 = required_header(&request, REQUEST_MAC_HEADER)
        .ok_or(ApiError::Unauthorized)?
        .to_string();

    let method = request.method().as_str().to_string();
    let (parts, body) = request.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    let computed_body_hash = sha256_base64(&body_bytes);
    if computed_body_hash != provided_body_hash {
        tracing::warn!(
            signing_session_id = %signing_session_id,
            path = %path_and_query,
            "rejecting relay request with body-hash mismatch"
        );
        return Err(ApiError::Unauthorized);
    }

    let message = build_signed_request_message(
        timestamp,
        &method,
        &path_and_query,
        &signing_session_id,
        &nonce,
        &computed_body_hash,
    );

    if let Err(error) = deployment
        .verify_relay_request_mac(
            signing_session_id,
            timestamp,
            &nonce,
            REQUEST_MAC_PURPOSE,
            message.as_bytes(),
            &request_mac_b64,
        )
        .await
    {
        tracing::warn!(
            signing_session_id = %signing_session_id,
            path = %path_and_query,
            reason = %error.as_str(),
            "rejecting relay request with invalid MAC"
        );
        return Err(ApiError::Unauthorized);
    }

    let mut request = Request::from_parts(parts, Body::from(body_bytes));
    request
        .extensions_mut()
        .insert(RelayRequestSignatureContext {
            signing_session_id,
            request_nonce: nonce,
        });

    Ok(next.run(request).await)
}

pub async fn sign_relay_response(
    State(deployment): State<DeploymentImpl>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if !is_relay_request(&request) {
        return Ok(next.run(request).await);
    }

    let Some(path_and_query) = relay_signed_path_and_query(&request)? else {
        return Ok(next.run(request).await);
    };

    let signing_session_id = required_header(&request, SIGNING_SESSION_HEADER)
        .ok_or(ApiError::Unauthorized)
        .and_then(|value| Uuid::parse_str(value).map_err(|_| ApiError::Unauthorized))?;
    let request_nonce = required_header(&request, NONCE_HEADER)
        .ok_or(ApiError::Unauthorized)?
        .to_string();

    let response = next.run(request).await;
    let (mut parts, body) = response.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| ApiError::Unauthorized)?;

    let body_hash = sha256_base64(&body_bytes);
    let response_timestamp = unix_timestamp_now().map_err(|_| ApiError::Unauthorized)?;
    let response_nonce = Uuid::new_v4().simple().to_string();
    let status = parts.status.as_u16();

    let message = build_signed_response_message(
        response_timestamp,
        status,
        &path_and_query,
        &signing_session_id,
        &request_nonce,
        &response_nonce,
        &body_hash,
    );

    let response_mac = deployment
        .relay_transport_mac(signing_session_id, RESPONSE_MAC_PURPOSE, message.as_bytes())
        .await
        .map_err(|error| {
            tracing::warn!(
                signing_session_id = %signing_session_id,
                path = %path_and_query,
                reason = %error.as_str(),
                "failed to sign relay response"
            );
            ApiError::Unauthorized
        })?;

    insert_header(
        &mut parts,
        RESPONSE_TIMESTAMP_HEADER,
        &response_timestamp.to_string(),
    );
    insert_header(&mut parts, RESPONSE_NONCE_HEADER, &response_nonce);
    insert_header(&mut parts, RESPONSE_BODY_HASH_HEADER, &body_hash);
    insert_header(&mut parts, RESPONSE_MAC_HEADER, &response_mac);

    Ok(Response::from_parts(parts, Body::from(body_bytes)))
}

fn build_signed_request_message(
    timestamp: i64,
    method: &str,
    path_and_query: &str,
    signing_session_id: &Uuid,
    nonce: &str,
    body_hash: &str,
) -> String {
    format!("v1|{timestamp}|{method}|{path_and_query}|{signing_session_id}|{nonce}|{body_hash}")
}

fn build_signed_response_message(
    timestamp: i64,
    status: u16,
    path_and_query: &str,
    signing_session_id: &Uuid,
    request_nonce: &str,
    response_nonce: &str,
    body_hash: &str,
) -> String {
    format!(
        "v1|{timestamp}|{status}|{path_and_query}|{signing_session_id}|{request_nonce}|{response_nonce}|{body_hash}"
    )
}

fn relay_signed_path_and_query(request: &Request) -> Result<Option<String>, ApiError> {
    let Some(original_uri) = request.extensions().get::<OriginalUri>() else {
        tracing::warn!("rejecting relay request without OriginalUri extension");
        return Err(ApiError::Unauthorized);
    };

    let path_and_query = if let Some(path_and_query) = original_uri.0.path_and_query() {
        path_and_query.as_str().to_string()
    } else {
        original_uri.0.path().to_string()
    };

    if !(path_and_query == "/api" || path_and_query.starts_with("/api/")) {
        tracing::warn!(
            path = %path_and_query,
            "rejecting relay request outside /api scope"
        );
        return Err(ApiError::Unauthorized);
    }

    if path_and_query == "/api/relay-auth" || path_and_query.starts_with("/api/relay-auth/") {
        return Ok(None);
    }

    Ok(Some(path_and_query))
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

fn insert_header(parts: &mut axum::http::response::Parts, name: &'static str, value: &str) {
    if let Ok(value) = HeaderValue::from_str(value) {
        parts.headers.insert(name, value);
    }
}

fn sha256_base64(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    BASE64_STANDARD.encode(digest)
}

fn unix_timestamp_now() -> Result<i64, ()> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ())?;
    i64::try_from(duration.as_secs()).map_err(|_| ())
}

fn is_relay_request(request: &Request) -> bool {
    request
        .headers()
        .get(RELAY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.trim() == "1")
}

pub fn relay_request_mac_purpose() -> &'static str {
    REQUEST_MAC_PURPOSE
}

pub fn relay_response_mac_purpose() -> &'static str {
    RESPONSE_MAC_PURPOSE
}
