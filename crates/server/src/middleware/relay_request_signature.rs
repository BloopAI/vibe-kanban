use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::{Body, to_bytes},
    extract::{OriginalUri, Request, State},
    http::HeaderValue,
    middleware::Next,
    response::Response,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const RELAY_HEADER: &str = "x-vk-relayed";
const SIGNING_SESSION_HEADER: &str = "x-vk-sig-session";
const TIMESTAMP_HEADER: &str = "x-vk-sig-ts";
const NONCE_HEADER: &str = "x-vk-sig-nonce";
const REQUEST_SIGNATURE_HEADER: &str = "x-vk-sig-signature";

const RESPONSE_TIMESTAMP_HEADER: &str = "x-vk-resp-ts";
const RESPONSE_NONCE_HEADER: &str = "x-vk-resp-nonce";
const RESPONSE_SIGNATURE_HEADER: &str = "x-vk-resp-signature";

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

    let path_and_query = relay_path_and_query(&request)?;
    let signing_session_id: Uuid = parse_header(&request, SIGNING_SESSION_HEADER)?;
    let timestamp: i64 = parse_header(&request, TIMESTAMP_HEADER)?;
    let nonce: String = parse_header(&request, NONCE_HEADER)?;
    let request_signature_b64: String = parse_header(&request, REQUEST_SIGNATURE_HEADER)?;

    let method = request.method().as_str().to_string();
    let (parts, body) = request.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| ApiError::Unauthorized)?;

    let message = build_request_message(
        timestamp,
        &method,
        &path_and_query,
        &signing_session_id,
        &nonce,
        &body_bytes,
    );

    if let Err(error) = deployment
        .relay_signing()
        .verify_message(
            signing_session_id,
            timestamp,
            &nonce,
            message.as_bytes(),
            &request_signature_b64,
        )
        .await
    {
        tracing::warn!(
            signing_session_id = %signing_session_id,
            path = %path_and_query,
            reason = %error.as_str(),
            "Rejecting relay request with invalid signature"
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

    let path_and_query = relay_path_and_query(&request)?;

    let signing_session_id: Uuid = parse_header(&request, SIGNING_SESSION_HEADER)?;
    let request_nonce: String = parse_header(&request, NONCE_HEADER)?;

    let response = next.run(request).await;
    let (mut parts, body) = response.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    let response_timestamp = unix_timestamp_now().map_err(|_| ApiError::Unauthorized)?;
    let response_nonce = Uuid::new_v4().simple().to_string();
    let status = parts.status.as_u16();

    let message = build_response_message(
        response_timestamp,
        status,
        &path_and_query,
        &signing_session_id,
        &request_nonce,
        &response_nonce,
        &body_bytes,
    );

    let response_signature = deployment
        .relay_signing()
        .sign_message(signing_session_id, message.as_bytes())
        .await
        .map_err(|error| {
            tracing::warn!(
                signing_session_id = %signing_session_id,
                path = %path_and_query,
                reason = %error.as_str(),
                "Failed to sign relay response"
            );
            ApiError::Unauthorized
        })?;

    insert_header(
        &mut parts,
        RESPONSE_TIMESTAMP_HEADER,
        &response_timestamp.to_string(),
    );
    insert_header(&mut parts, RESPONSE_NONCE_HEADER, &response_nonce);
    insert_header(&mut parts, RESPONSE_SIGNATURE_HEADER, &response_signature);

    Ok(Response::from_parts(parts, Body::from(body_bytes)))
}

fn build_request_message(
    timestamp: i64,
    method: &str,
    path_and_query: &str,
    signing_session_id: &Uuid,
    nonce: &str,
    body: &[u8],
) -> String {
    let body_hash = BASE64_STANDARD.encode(Sha256::digest(body));
    format!("v1|{timestamp}|{method}|{path_and_query}|{signing_session_id}|{nonce}|{body_hash}")
}

fn build_response_message(
    timestamp: i64,
    status: u16,
    path_and_query: &str,
    signing_session_id: &Uuid,
    request_nonce: &str,
    response_nonce: &str,
    body: &[u8],
) -> String {
    let body_hash = BASE64_STANDARD.encode(Sha256::digest(body));
    format!(
        "v1|{timestamp}|{status}|{path_and_query}|{signing_session_id}|{request_nonce}|{response_nonce}|{body_hash}"
    )
}

fn relay_path_and_query(request: &Request) -> Result<String, ApiError> {
    let Some(original_uri) = request.extensions().get::<OriginalUri>() else {
        tracing::warn!("Rejecting relay request without OriginalUri extension");
        return Err(ApiError::Unauthorized);
    };

    Ok(original_uri
        .0
        .path_and_query()
        .map(|path_and_query| path_and_query.as_str().to_string())
        .unwrap_or_else(|| original_uri.0.path().to_string()))
}

fn parse_header<T: std::str::FromStr>(
    request: &Request,
    name: &'static str,
) -> Result<T, ApiError> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or(ApiError::Unauthorized)?
        .parse()
        .map_err(|_| ApiError::Unauthorized)
}

fn insert_header(parts: &mut axum::http::response::Parts, name: &'static str, value: &str) {
    if let Ok(value) = HeaderValue::from_str(value) {
        parts.headers.insert(name, value);
    }
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
