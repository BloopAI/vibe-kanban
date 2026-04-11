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
use relay_client::RELAY_HEADER;
use relay_control::signing::{
    NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RESPONSE_NONCE_HEADER, RESPONSE_SIGNATURE_HEADER,
    RESPONSE_TIMESTAMP_HEADER, RequestSignature, SIGNING_SESSION_HEADER, TIMESTAMP_HEADER,
    build_response_signing_message,
};
use url::form_urlencoded;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub type RelayRequestSignatureContext = RequestSignature;

/// Maximum body size (50 MiB) for relay-signed requests. Both the request body
/// (for signature verification) and the response body (for signing) are buffered
/// into memory. This cap prevents a large payload from causing OOM.
const RELAY_SIGNED_BODY_MAX_BYTES: usize = 50 * 1024 * 1024;

pub async fn require_relay_request_signature(
    State(deployment): State<DeploymentImpl>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if !is_relay_request(&request) {
        return Ok(next.run(request).await);
    }

    let (request_signature, path_and_query) = extract_request_signature(&request)?;

    let (parts, body) = request.into_parts();
    let body_bytes = to_bytes(body, RELAY_SIGNED_BODY_MAX_BYTES)
        .await
        .map_err(|_| ApiError::PayloadTooLarge)?;

    if let Err(error) = deployment
        .relay_signing()
        .verify_request(
            &request_signature,
            parts.method.as_str(),
            &path_and_query,
            &body_bytes,
        )
        .await
    {
        tracing::warn!(
            signing_session_id = %request_signature.signing_session_id,
            path = %path_and_query,
            reason = %error.as_str(),
            "Rejecting relay request with invalid signature"
        );
        return Err(ApiError::Unauthorized);
    }

    let mut request = Request::from_parts(parts, Body::from(body_bytes));
    request.extensions_mut().insert(request_signature);

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

    let (request_signature, path_and_query) = extract_request_signature(&request)?;

    let response = next.run(request).await;
    let (mut parts, body) = response.into_parts();
    let body_bytes = to_bytes(body, RELAY_SIGNED_BODY_MAX_BYTES)
        .await
        .map_err(|_| ApiError::PayloadTooLarge)?;
    let response_timestamp = unix_timestamp_now().map_err(|_| ApiError::Unauthorized)?;
    let response_nonce = Uuid::new_v4();
    let status = parts.status.as_u16();

    let message = build_response_signing_message(
        response_timestamp,
        status,
        &path_and_query,
        request_signature.signing_session_id,
        request_signature.nonce,
        response_nonce,
        &body_bytes,
    );

    let signature = deployment.relay_signing().sign_bytes(message.as_bytes());
    let response_signature = BASE64_STANDARD.encode(signature.to_bytes());

    insert_header(
        &mut parts,
        RESPONSE_TIMESTAMP_HEADER,
        &response_timestamp.to_string(),
    );
    insert_header(
        &mut parts,
        RESPONSE_NONCE_HEADER,
        &response_nonce.to_string(),
    );
    insert_header(&mut parts, RESPONSE_SIGNATURE_HEADER, &response_signature);

    Ok(Response::from_parts(parts, Body::from(body_bytes)))
}

#[allow(clippy::result_large_err)]
fn extract_request_signature(request: &Request) -> Result<(RequestSignature, String), ApiError> {
    if let Some(result) = try_parse_signature_from_headers(request)? {
        return Ok(result);
    }

    if let Some(result) = try_parse_signature_from_query(request)? {
        return Ok(result);
    }

    Err(ApiError::Unauthorized)
}

#[allow(clippy::result_large_err)]
fn try_parse_signature_from_headers(
    request: &Request,
) -> Result<Option<(RequestSignature, String)>, ApiError> {
    let signing_session = parse_header_optional::<String>(request, SIGNING_SESSION_HEADER);
    let timestamp = parse_header_optional::<String>(request, TIMESTAMP_HEADER);
    let nonce = parse_header_optional::<String>(request, NONCE_HEADER);
    let request_signature = parse_header_optional::<String>(request, REQUEST_SIGNATURE_HEADER);

    let any_present = signing_session.is_some()
        || timestamp.is_some()
        || nonce.is_some()
        || request_signature.is_some();
    let all_present = signing_session.is_some()
        && timestamp.is_some()
        && nonce.is_some()
        && request_signature.is_some();

    if any_present && !all_present {
        return Err(ApiError::Unauthorized);
    }

    if !all_present {
        return Ok(None);
    }

    let signing_session_id = signing_session
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(ApiError::Unauthorized)?;
    let timestamp = timestamp
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or(ApiError::Unauthorized)?;
    let nonce = nonce
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(ApiError::Unauthorized)?;
    let signature_b64 = request_signature.ok_or(ApiError::Unauthorized)?;

    Ok(Some((
        RequestSignature {
            signing_session_id,
            timestamp,
            nonce,
            signature_b64,
        },
        relay_path_and_query(request)?,
    )))
}

#[allow(clippy::result_large_err)]
fn try_parse_signature_from_query(
    request: &Request,
) -> Result<Option<(RequestSignature, String)>, ApiError> {
    let Some(original_uri) = request.extensions().get::<OriginalUri>() else {
        tracing::warn!("Rejecting relay request without OriginalUri extension");
        return Err(ApiError::Unauthorized);
    };

    let path = original_uri.0.path().to_string();
    let query = original_uri.0.query().unwrap_or_default();
    if query.is_empty() {
        return Ok(None);
    }

    let mut filtered_query = form_urlencoded::Serializer::new(String::new());
    let mut signing_session: Option<String> = None;
    let mut timestamp: Option<String> = None;
    let mut nonce: Option<String> = None;
    let mut request_signature: Option<String> = None;

    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            SIGNING_SESSION_HEADER => signing_session = Some(value.into_owned()),
            TIMESTAMP_HEADER => timestamp = Some(value.into_owned()),
            NONCE_HEADER => nonce = Some(value.into_owned()),
            REQUEST_SIGNATURE_HEADER => request_signature = Some(value.into_owned()),
            _ => {
                filtered_query.append_pair(&key, &value);
            }
        }
    }

    let any_present = signing_session.is_some()
        || timestamp.is_some()
        || nonce.is_some()
        || request_signature.is_some();
    let all_present = signing_session.is_some()
        && timestamp.is_some()
        && nonce.is_some()
        && request_signature.is_some();

    if any_present && !all_present {
        return Err(ApiError::Unauthorized);
    }

    if !any_present {
        return Ok(None);
    }

    let signing_session_id = signing_session
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(ApiError::Unauthorized)?;
    let timestamp = timestamp
        .and_then(|value| value.parse::<i64>().ok())
        .ok_or(ApiError::Unauthorized)?;
    let nonce = nonce
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(ApiError::Unauthorized)?;
    let signature_b64 = request_signature.ok_or(ApiError::Unauthorized)?;

    let filtered = filtered_query.finish();
    let path_and_query = if filtered.is_empty() {
        path
    } else {
        format!("{path}?{filtered}")
    };

    Ok(Some((
        RequestSignature {
            signing_session_id,
            timestamp,
            nonce,
            signature_b64,
        },
        path_and_query,
    )))
}

#[allow(clippy::result_large_err)]
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

fn parse_header_optional<T: std::str::FromStr>(request: &Request, name: &'static str) -> Option<T> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| value.parse::<T>().ok())
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
