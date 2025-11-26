use std::collections::HashMap;

use axum::{
    Router,
    body::Body,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use futures::TryStreamExt;
use secrecy::ExposeSecret;
use tracing::error;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/shape/shared_tasks", get(proxy_shared_tasks))
}

/// Electric protocol query parameters that are safe to forward.
/// Based on https://electric-sql.com/docs/guides/auth#proxy-auth
const ELECTRIC_PARAMS: &[&str] = &["offset", "handle", "live", "cursor", "where", "columns"];

/// Proxy Shape requests for the `shared_tasks` table.
///
/// Route: GET /v1/shape/shared_tasks?offset=-1
///
/// The `require_session` middleware has already validated the Bearer token
/// before this handler is called.
pub async fn proxy_shared_tasks(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, ProxyError> {
    proxy_table(&state, "shared_tasks", &params).await
}

/// Proxy a Shape request to Electric for a specific table.
///
/// The table is set server-side (not from client params) to prevent
/// unauthorized access to other tables.
async fn proxy_table(
    state: &AppState,
    table: &str,
    params: &HashMap<String, String>,
) -> Result<Response, ProxyError> {
    // Build the Electric URL
    let mut origin_url = url::Url::parse(&state.config.electric_url)
        .map_err(|e| ProxyError::InvalidConfig(format!("invalid electric_url: {e}")))?;

    origin_url.set_path("/v1/shape");

    // Set table server-side (security: client can't override)
    origin_url.query_pairs_mut().append_pair("table", table);

    for (key, value) in params {
        if ELECTRIC_PARAMS.contains(&key.as_str()) {
            origin_url.query_pairs_mut().append_pair(key, value);
        }
    }

    let mut request = state.http_client.get(origin_url.as_str());
    if let Some(token) = &state.config.electric_token {
        request = request.bearer_auth(token.expose_secret());
    }

    let response = request.send().await.map_err(ProxyError::Connection)?;

    let status = response.status();

    let mut headers = HeaderMap::new();

    // Copy headers from Electric response, but remove problematic ones
    for (key, value) in response.headers() {
        // Skip headers that interfere with browser handling
        if key == header::CONTENT_ENCODING || key == header::CONTENT_LENGTH {
            continue;
        }
        headers.insert(key.clone(), value.clone());
    }

    // Add Vary header for proper caching with auth
    headers.insert(header::VARY, HeaderValue::from_static("Authorization"));

    // Stream the response body directly without buffering
    let body_stream = response
        .bytes_stream()
        .map_err(|e| std::io::Error::other(e));
    let body = Body::from_stream(body_stream);

    Ok((status, headers, body).into_response())
}

#[derive(Debug)]
pub enum ProxyError {
    Connection(reqwest::Error),
    InvalidConfig(String),
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        match self {
            ProxyError::Connection(err) => {
                error!(?err, "failed to connect to Electric service");
                (
                    StatusCode::BAD_GATEWAY,
                    "failed to connect to Electric service",
                )
                    .into_response()
            }
            ProxyError::InvalidConfig(msg) => {
                error!(%msg, "invalid Electric proxy configuration");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error").into_response()
            }
        }
    }
}
