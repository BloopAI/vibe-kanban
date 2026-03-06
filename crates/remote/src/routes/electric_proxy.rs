use std::collections::HashMap;

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures::TryStreamExt;
use secrecy::ExposeSecret;
use serde::Deserialize;
use tracing::error;
use uuid::Uuid;

use crate::{AppState, shape_definition::ShapeExport};

#[derive(Deserialize)]
pub(crate) struct OrgShapeQuery {
    pub organization_id: Uuid,
    #[serde(flatten)]
    pub params: HashMap<String, String>,
}

#[derive(Deserialize)]
pub(crate) struct ShapeQuery {
    #[serde(flatten)]
    pub params: HashMap<String, String>,
}

const ELECTRIC_PARAMS: &[&str] = &["offset", "handle", "live", "cursor", "columns"];
const ELECTRIC_STICKY_HEADER: &str = "x-vk-electric-sticky";

pub fn router() -> Router<AppState> {
    let mut router = Router::new();
    for route in crate::shape_routes::all_shape_routes() {
        router = router.merge(route.router);
    }
    router
}

/// Proxy a Shape request to Electric for a specific table.
///
/// The table and where clause are set server-side (not from client params)
/// to prevent unauthorized access to other tables or data.
pub(crate) async fn proxy_table(
    state: &AppState,
    shape: &dyn ShapeExport,
    client_params: &HashMap<String, String>,
    electric_params: &[String],
    session_id: Uuid,
) -> Result<Response, ProxyError> {
    // Build the Electric URL
    let mut origin_url = url::Url::parse(&state.config.electric_url)
        .map_err(|e| ProxyError::InvalidConfig(format!("invalid electric_url: {e}")))?;

    origin_url.set_path("/v1/shape");

    // Set table server-side (security: client can't override)
    origin_url
        .query_pairs_mut()
        .append_pair("table", shape.table());

    // Set WHERE clause with parameterized values
    origin_url
        .query_pairs_mut()
        .append_pair("where", shape.where_clause());

    // Pass params for $1, $2, etc. placeholders
    for (i, param) in electric_params.iter().enumerate() {
        origin_url
            .query_pairs_mut()
            .append_pair(&format!("params[{}]", i + 1), param);
    }

    // Forward safe client params
    for (key, value) in client_params {
        if ELECTRIC_PARAMS.contains(&key.as_str()) {
            origin_url.query_pairs_mut().append_pair(key, value);
        }
    }

    if let Some(secret) = &state.config.electric_secret {
        origin_url
            .query_pairs_mut()
            .append_pair("secret", secret.expose_secret());
    }

    let response = state
        .http_client
        .get(origin_url.as_str())
        .header(ELECTRIC_STICKY_HEADER, session_id.to_string())
        .send()
        .await
        .map_err(ProxyError::Connection)?;

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
    let body_stream = response.bytes_stream().map_err(std::io::Error::other);
    let body = Body::from_stream(body_stream);

    Ok((status, headers, body).into_response())
}

#[derive(Debug)]
pub(crate) enum ProxyError {
    Connection(reqwest::Error),
    InvalidConfig(String),
    Authorization(String),
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
            ProxyError::Authorization(msg) => {
                error!(%msg, "authorization failed for Electric proxy");
                (StatusCode::FORBIDDEN, "forbidden").into_response()
            }
        }
    }
}
