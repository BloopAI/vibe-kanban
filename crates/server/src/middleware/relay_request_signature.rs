use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::{Body, to_bytes},
    extract::{OriginalUri, Request, State},
    http::{HeaderValue, Method},
    middleware::Next,
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use relay_client::RELAY_HEADER;
use relay_control::signing::{
    NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RESPONSE_NONCE_HEADER, RESPONSE_SIGNATURE_HEADER,
    RESPONSE_TIMESTAMP_HEADER, RelaySigningService, RequestSignature, SIGNING_SESSION_HEADER,
    TIMESTAMP_HEADER, build_response_signing_message,
};
use url::form_urlencoded;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub type RelayRequestSignatureContext = RequestSignature;

/// Maximum body size (50 MiB) for relay-signed requests. Both the request body
/// (for signature verification) and the response body (for signing) are buffered
/// into memory. This cap prevents a large payload from causing OOM.
const RELAY_SIGNED_BODY_MAX_BYTES: usize = 50 * 1024 * 1024;

/// How a relayed request to an `/api` route is handled. Paths are the ones the
/// `/api` router matches on, so without the `/api` prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelayRoutePolicy {
    /// Must work before a device is paired. Passed through without a
    /// signature, and the response is not signed.
    Unsigned,
    /// Requires a valid signature from a paired device; the response is signed.
    Signed,
    /// Requires a valid signature, then is refused: only the local machine may
    /// use it.
    LocalOnly,
}

/// Routes a relayed request may reach without a signature. Each one does its
/// own authentication: the SPAKE2 steps need the one-time enrollment code, and
/// the refresh verifies an Ed25519 signature from a trusted client.
///
/// Matching is exact on the raw path. A trailing slash, a doubled slash or a
/// percent-encoded variant is not on this list, so it falls back to `Signed`.
const UNSIGNED_RELAY_ROUTES: &[(Method, &str)] = &[
    (Method::POST, "/relay-auth/server/spake2/start"),
    (Method::POST, "/relay-auth/server/spake2/finish"),
    (Method::POST, "/relay-auth/server/signing-session/refresh"),
];

/// Decide how a relayed request is handled. Anything not listed is `Signed`.
pub fn relay_route_policy(method: &Method, path: &str) -> RelayRoutePolicy {
    if UNSIGNED_RELAY_ROUTES
        .iter()
        .any(|(allowed_method, allowed_path)| allowed_method == method && *allowed_path == path)
    {
        return RelayRoutePolicy::Unsigned;
    }

    if is_local_only_path(path) {
        return RelayRoutePolicy::LocalOnly;
    }

    RelayRoutePolicy::Signed
}

/// Routes that nothing calls over the relay: managing this host's paired
/// devices, the enrollment code, and proxying on to other hosts (which would
/// sign with this host's keys).
fn is_local_only_path(path: &str) -> bool {
    path == "/relay-auth/server/enrollment-code"
        || path == "/relay-auth/server/clients"
        || path.starts_with("/relay-auth/server/clients/")
        || path.starts_with("/host/")
}

/// Guard for every `/api` route. Requests that did not come through the relay
/// pass through untouched. Relayed requests are handled by
/// [`relay_route_policy`], so a new route requires a signature by default.
pub async fn relay_request_guard(
    State(deployment): State<DeploymentImpl>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    guard_relay_request(deployment.relay_signing(), request, next).await
}

pub(crate) async fn guard_relay_request(
    signing: &RelaySigningService,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if !is_relay_request(&request) {
        return Ok(next.run(request).await);
    }

    let policy = relay_route_policy(request.method(), request.uri().path());
    if policy == RelayRoutePolicy::Unsigned {
        return Ok(next.run(request).await);
    }

    let (request, request_signature, path_and_query) =
        verify_relay_request(signing, request).await?;

    let response = if policy == RelayRoutePolicy::LocalOnly {
        ApiError::Forbidden("This route is not available over relay.".to_string()).into_response()
    } else {
        next.run(request).await
    };

    sign_response(signing, response, &request_signature, &path_and_query).await
}

async fn verify_relay_request(
    signing: &RelaySigningService,
    request: Request,
) -> Result<(Request, RequestSignature, String), ApiError> {
    let (request_signature, path_and_query) = extract_request_signature(&request)?;

    let (parts, body) = request.into_parts();
    let body_bytes = to_bytes(body, RELAY_SIGNED_BODY_MAX_BYTES)
        .await
        .map_err(|_| ApiError::PayloadTooLarge)?;

    if let Err(error) = signing
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
    request.extensions_mut().insert(request_signature.clone());

    Ok((request, request_signature, path_and_query))
}

async fn sign_response(
    signing: &RelaySigningService,
    response: Response,
    request_signature: &RequestSignature,
    path_and_query: &str,
) -> Result<Response, ApiError> {
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
        path_and_query,
        request_signature.signing_session_id,
        request_signature.nonce,
        response_nonce,
        &body_bytes,
    );

    let signature = signing.sign_bytes(message.as_bytes());
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

#[cfg(test)]
mod tests {
    use axum::{
        Router,
        body::{Body, to_bytes},
        extract::{Request, State},
        http::{Method, StatusCode},
        middleware::{Next, from_fn_with_state},
        response::Response,
        routing::{get, post},
    };
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
    use ed25519_dalek::{Signature, SigningKey, Verifier};
    use relay_client::RELAY_HEADER;
    use relay_control::signing::{
        NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RESPONSE_NONCE_HEADER, RESPONSE_SIGNATURE_HEADER,
        RESPONSE_TIMESTAMP_HEADER, RelaySigningService, SIGNING_SESSION_HEADER, TIMESTAMP_HEADER,
        build_response_signing_message,
    };
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::{RelayRoutePolicy, guard_relay_request, relay_route_policy};
    use crate::error::ApiError;

    const HOST_ID: &str = "3f2b8c1e-7d4a-4f6b-9a1e-2c5d8e9f0a1b";

    #[test]
    fn pairing_routes_are_unsigned() {
        for path in [
            "/relay-auth/server/spake2/start",
            "/relay-auth/server/spake2/finish",
            "/relay-auth/server/signing-session/refresh",
        ] {
            assert_eq!(
                relay_route_policy(&Method::POST, path),
                RelayRoutePolicy::Unsigned,
                "{path}"
            );
        }
    }

    #[test]
    fn other_routes_are_signed() {
        for (method, path) in [
            (Method::GET, "/health"),
            (Method::GET, "/relay-auth/client/hosts"),
            (Method::POST, "/relay-auth/client/pair"),
            (Method::DELETE, "/relay-auth/client/hosts/abc"),
            (Method::GET, "/terminal/ws"),
            (Method::POST, "/open-remote-editor/workspace"),
            (Method::GET, "/does-not-exist"),
            (Method::GET, "/"),
            (Method::GET, ""),
        ] {
            assert_eq!(
                relay_route_policy(&method, path),
                RelayRoutePolicy::Signed,
                "{method} {path}"
            );
        }
    }

    #[test]
    fn device_management_and_host_proxy_are_local_only() {
        let host_path = format!("/host/{HOST_ID}/api/health");
        for (method, path) in [
            (Method::GET, "/relay-auth/server/clients"),
            (Method::DELETE, "/relay-auth/server/clients/abc"),
            (Method::POST, "/relay-auth/server/enrollment-code"),
            (Method::GET, host_path.as_str()),
            (Method::POST, host_path.as_str()),
        ] {
            assert_eq!(
                relay_route_policy(&method, path),
                RelayRoutePolicy::LocalOnly,
                "{method} {path}"
            );
        }
    }

    #[test]
    fn variants_of_pairing_routes_are_not_unsigned() {
        for path in [
            "/relay-auth/server/spake2/start/",
            "//relay-auth/server/spake2/start",
            "/relay-auth/server//spake2/start",
            "/relay-auth/server/spake2%2Fstart",
            "/relay-auth/server/spake2/%73tart",
            "/relay-auth/server/SPAKE2/start",
            "/relay-auth/server/spake2/start/../../clients",
            "/api/relay-auth/server/spake2/start",
        ] {
            assert_ne!(
                relay_route_policy(&Method::POST, path),
                RelayRoutePolicy::Unsigned,
                "{path}"
            );
        }
    }

    #[test]
    fn wrong_method_on_pairing_route_is_signed() {
        for method in [Method::GET, Method::PUT, Method::DELETE, Method::HEAD] {
            assert_eq!(
                relay_route_policy(&method, "/relay-auth/server/spake2/start"),
                RelayRoutePolicy::Signed,
                "{method}"
            );
        }
    }

    struct TestPeer {
        server: RelaySigningService,
        client: RelaySigningService,
        session_id: Uuid,
    }

    async fn paired_peer() -> TestPeer {
        let server = RelaySigningService::new(SigningKey::from_bytes(&[1; 32]));
        let client_key = SigningKey::from_bytes(&[2; 32]);
        let session_id = server.create_session(client_key.verifying_key()).await;
        TestPeer {
            server,
            client: RelaySigningService::new(client_key),
            session_id,
        }
    }

    async fn test_guard(
        State(signing): State<RelaySigningService>,
        request: Request,
        next: Next,
    ) -> Result<Response, ApiError> {
        guard_relay_request(&signing, request, next).await
    }

    fn app(signing: RelaySigningService) -> Router {
        let api = Router::new()
            .route("/health", get(|| async { "ok" }))
            .route(
                "/relay-auth/server/spake2/start",
                post(|| async { "start" }),
            )
            .route("/relay-auth/server/clients", get(|| async { "clients" }))
            .route("/host/{host_id}/{*tail}", get(|| async { "proxied" }))
            .layer(from_fn_with_state(signing, test_guard));
        Router::new().nest("/api", api)
    }

    fn request(method: Method, uri: &str, relayed: bool) -> Request {
        let mut builder = Request::builder().method(method).uri(uri);
        if relayed {
            builder = builder.header(RELAY_HEADER, "1");
        }
        builder.body(Body::empty()).unwrap()
    }

    fn signed_request(peer: &TestPeer, method: Method, uri: &str) -> Request {
        let signature = peer
            .client
            .sign_request(peer.session_id, method.as_str(), uri, &[]);
        Request::builder()
            .method(method)
            .uri(uri)
            .header(RELAY_HEADER, "1")
            .header(
                SIGNING_SESSION_HEADER,
                signature.signing_session_id.to_string(),
            )
            .header(TIMESTAMP_HEADER, signature.timestamp.to_string())
            .header(NONCE_HEADER, signature.nonce.to_string())
            .header(REQUEST_SIGNATURE_HEADER, signature.signature_b64)
            .body(Body::empty())
            .unwrap()
    }

    async fn status(app: &Router, request: Request) -> StatusCode {
        app.clone().oneshot(request).await.unwrap().status()
    }

    #[tokio::test]
    async fn local_requests_pass_through_unchanged() {
        let peer = paired_peer().await;
        let app = app(peer.server.clone());

        for uri in [
            "/api/health",
            "/api/relay-auth/server/clients",
            &format!("/api/host/{HOST_ID}/api/health"),
        ] {
            let response = app
                .clone()
                .oneshot(request(Method::GET, uri, false))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert!(response.headers().get(RESPONSE_SIGNATURE_HEADER).is_none());
        }
    }

    #[tokio::test]
    async fn unsigned_relayed_requests_are_rejected() {
        let peer = paired_peer().await;
        let app = app(peer.server.clone());

        for (method, uri) in [
            (Method::GET, "/api/health".to_string()),
            (Method::GET, "/api/relay-auth/server/clients".to_string()),
            (Method::GET, format!("/api/host/{HOST_ID}/api/health")),
        ] {
            assert_eq!(
                status(&app, request(method.clone(), &uri, true)).await,
                StatusCode::UNAUTHORIZED,
                "{method} {uri}"
            );
        }
    }

    #[tokio::test]
    async fn unmatched_relayed_paths_reach_no_handler() {
        // axum answers unmatched paths with its own 404 before any layer runs.
        let peer = paired_peer().await;
        let app = app(peer.server.clone());

        for uri in [
            "/api/does-not-exist",
            "/api/relay-auth/server/spake2/start/",
            "/api/relay-auth/server/spake2%2Fstart",
            "/api//relay-auth/server/spake2/start",
        ] {
            assert_eq!(
                status(&app, request(Method::POST, uri, true)).await,
                StatusCode::NOT_FOUND,
                "{uri}"
            );
        }
    }

    #[tokio::test]
    async fn pairing_route_works_unsigned_over_relay() {
        let peer = paired_peer().await;
        let app = app(peer.server.clone());

        let response = app
            .oneshot(request(
                Method::POST,
                "/api/relay-auth/server/spake2/start",
                true,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get(RESPONSE_SIGNATURE_HEADER).is_none());
    }

    #[tokio::test]
    async fn signed_relayed_request_passes_and_response_is_signed() {
        let peer = paired_peer().await;
        let app = app(peer.server.clone());
        let request = signed_request(&peer, Method::GET, "/api/health");
        let request_nonce: Uuid = request.headers()[NONCE_HEADER]
            .to_str()
            .unwrap()
            .parse()
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let header = |name: &str| response.headers()[name].to_str().unwrap().to_string();
        let timestamp: i64 = header(RESPONSE_TIMESTAMP_HEADER).parse().unwrap();
        let response_nonce: Uuid = header(RESPONSE_NONCE_HEADER).parse().unwrap();
        let signature_bytes: [u8; 64] = BASE64_STANDARD
            .decode(header(RESPONSE_SIGNATURE_HEADER))
            .unwrap()
            .try_into()
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&body[..], b"ok");

        let message = build_response_signing_message(
            timestamp,
            200,
            "/api/health",
            peer.session_id,
            request_nonce,
            response_nonce,
            &body,
        );
        peer.server
            .server_public_key()
            .verify(message.as_bytes(), &Signature::from_bytes(&signature_bytes))
            .expect("response signature verifies");
    }

    #[tokio::test]
    async fn signature_in_query_is_accepted() {
        // WebSocket upgrades carry the signature in the query string.
        let peer = paired_peer().await;
        let app = app(peer.server.clone());
        let signature = peer
            .client
            .sign_request(peer.session_id, "GET", "/api/health?x=1", &[]);
        let uri = format!(
            "/api/health?x=1&{SIGNING_SESSION_HEADER}={}&{TIMESTAMP_HEADER}={}&{NONCE_HEADER}={}&{REQUEST_SIGNATURE_HEADER}={}",
            signature.signing_session_id,
            signature.timestamp,
            signature.nonce,
            url::form_urlencoded::byte_serialize(signature.signature_b64.as_bytes())
                .collect::<String>(),
        );

        assert_eq!(
            status(&app, request(Method::GET, &uri, true)).await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn invalid_or_replayed_signatures_are_rejected() {
        let peer = paired_peer().await;
        let app = app(peer.server.clone());

        // Signed for a different path.
        let mut wrong_path = signed_request(&peer, Method::GET, "/api/other");
        *wrong_path.uri_mut() = "/api/health".parse().unwrap();
        assert_eq!(status(&app, wrong_path).await, StatusCode::UNAUTHORIZED);

        // Unknown signing session.
        let stranger = RelaySigningService::new(SigningKey::from_bytes(&[3; 32]));
        let unknown = TestPeer {
            server: peer.server.clone(),
            client: stranger,
            session_id: Uuid::new_v4(),
        };
        assert_eq!(
            status(&app, signed_request(&unknown, Method::GET, "/api/health")).await,
            StatusCode::UNAUTHORIZED
        );

        // Replay of a request that was accepted once.
        let first = signed_request(&peer, Method::GET, "/api/health");
        let mut replay = request(Method::GET, "/api/health", false);
        *replay.headers_mut() = first.headers().clone();
        assert_eq!(status(&app, first).await, StatusCode::OK);
        assert_eq!(status(&app, replay).await, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn local_only_routes_are_refused_even_when_signed() {
        let peer = paired_peer().await;
        let app = app(peer.server.clone());

        for uri in [
            "/api/relay-auth/server/clients".to_string(),
            format!("/api/host/{HOST_ID}/api/health"),
        ] {
            let response = app
                .clone()
                .oneshot(signed_request(&peer, Method::GET, &uri))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{uri}");
            assert!(response.headers().get(RESPONSE_SIGNATURE_HEADER).is_some());
        }
    }
}
