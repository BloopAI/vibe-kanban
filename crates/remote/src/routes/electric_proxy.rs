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

use crate::{AppState, auth::RequestContext, validated_where, validated_where::ValidatedWhere};

pub fn router() -> Router<AppState> {
    Router::new().route("/shape/shared_tasks", get(proxy_shared_tasks))
}

/// Electric protocol query parameters that are safe to forward.
/// Based on https://electric-sql.com/docs/guides/auth#proxy-auth
/// Note: "where" is NOT included because it's controlled server-side for security.
const ELECTRIC_PARAMS: &[&str] = &["offset", "handle", "live", "cursor", "columns"];

/// Proxy Shape requests for the `shared_tasks` table.
///
/// Route: GET /v1/shape/shared_tasks?offset=-1
///
/// The `require_session` middleware has already validated the Bearer token
/// before this handler is called.
///
/// Uses Electric's subquery feature to filter tasks by project membership chain:
/// user -> organization_member_metadata -> projects -> shared_tasks
pub async fn proxy_shared_tasks(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, ProxyError> {
    // Build filter using subquery - Electric filters by project membership chain
    // This returns tasks from projects in organizations the user is a member of
    let query = validated_where!(
        "shared_tasks",
        r#""project_id" IN (SELECT id FROM projects WHERE organization_id IN (SELECT organization_id FROM organization_member_metadata WHERE user_id = $1))"#,
        ctx.user.id
    );
    let query_params = &[ctx.user.id.to_string()];

    tracing::debug!("Proxying Electric Shape request for shared_tasks table{query:?}");
    proxy_table(&state, &query, &params, query_params).await
}

/// Proxy a Shape request to Electric for a specific table.
///
/// The table and where clause are set server-side (not from client params)
/// to prevent unauthorized access to other tables or data.
async fn proxy_table(
    state: &AppState,
    query: &ValidatedWhere,
    client_params: &HashMap<String, String>,
    electric_params: &[String],
) -> Result<Response, ProxyError> {
    // Build the Electric URL
    let mut origin_url = url::Url::parse(&state.config.electric_url)
        .map_err(|e| ProxyError::InvalidConfig(format!("invalid electric_url: {e}")))?;

    origin_url.set_path("/v1/shape");

    // Set table server-side (security: client can't override)
    origin_url
        .query_pairs_mut()
        .append_pair("table", query.table);

    // Set WHERE clause with parameterized values
    origin_url
        .query_pairs_mut()
        .append_pair("where", query.where_clause);

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
pub enum ProxyError {
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
