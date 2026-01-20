use std::collections::HashMap;

use axum::{
    Router,
    body::Body,
    extract::{Extension, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use futures::TryStreamExt;
use secrecy::ExposeSecret;
use serde::Deserialize;
use tracing::error;
use ts_rs::TS;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext, db::organization_members, shapes};

#[derive(Deserialize)]
struct OrgShapeQuery {
    organization_id: Uuid,
    #[serde(flatten)]
    params: HashMap<String, String>,
}

#[derive(Deserialize)]
struct ShapeQuery {
    #[serde(flatten)]
    params: HashMap<String, String>,
}

const ELECTRIC_PARAMS: &[&str] = &["offset", "handle", "live", "cursor", "columns"];

pub fn router() -> Router<AppState> {
    Router::new()
        // Org-scoped
        .route(shapes::PROJECTS.url, get(proxy_projects))
        .route(shapes::NOTIFICATIONS.url, get(proxy_notifications))
        // Project-scoped
        .route(shapes::WORKSPACES.url, get(proxy_workspaces))
        .route(shapes::PROJECT_STATUSES.url, get(proxy_project_statuses))
        .route(shapes::TAGS.url, get(proxy_tags))
        .route(shapes::ISSUES.url, get(proxy_issues))
        .route(shapes::ISSUE_ASSIGNEES.url, get(proxy_issue_assignees))
        .route(shapes::ISSUE_FOLLOWERS.url, get(proxy_issue_followers))
        .route(shapes::ISSUE_TAGS.url, get(proxy_issue_tags))
        .route(
            shapes::ISSUE_RELATIONSHIPS.url,
            get(proxy_issue_relationships),
        )
        // Issue-scoped
        .route(shapes::ISSUE_COMMENTS.url, get(proxy_issue_comments))
        .route(
            shapes::ISSUE_COMMENT_REACTIONS.url,
            get(proxy_issue_comment_reactions),
        )
}

async fn proxy_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<OrgShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_membership(state.pool(), query.organization_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::PROJECTS,
        &query.params,
        &[query.organization_id.to_string()],
    )
    .await
}

async fn proxy_notifications(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<OrgShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_membership(state.pool(), query.organization_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::NOTIFICATIONS,
        &query.params,
        &[query.organization_id.to_string(), ctx.user.id.to_string()],
    )
    .await
}

async fn proxy_workspaces(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::WORKSPACES,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_project_statuses(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::PROJECT_STATUSES,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::TAGS,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUES,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_issue_assignees(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUE_ASSIGNEES,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_issue_followers(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUE_FOLLOWERS,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_issue_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUE_TAGS,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_issue_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_issue_access(state.pool(), issue_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUE_COMMENTS,
        &query.params,
        &[issue_id.to_string()],
    )
    .await
}

async fn proxy_issue_relationships(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUE_RELATIONSHIPS,
        &query.params,
        &[project_id.to_string()],
    )
    .await
}

async fn proxy_issue_comment_reactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_id): Path<Uuid>,
    Query(query): Query<ShapeQuery>,
) -> Result<Response, ProxyError> {
    organization_members::assert_issue_access(state.pool(), issue_id, ctx.user.id)
        .await
        .map_err(|e| ProxyError::Authorization(e.to_string()))?;

    proxy_table(
        &state,
        &shapes::ISSUE_COMMENT_REACTIONS,
        &query.params,
        &[issue_id.to_string()],
    )
    .await
}

/// Proxy a Shape request to Electric for a specific table.
///
/// The table and where clause are set server-side (not from client params)
/// to prevent unauthorized access to other tables or data.
async fn proxy_table<T: TS + Sync>(
    state: &AppState,
    shape: &shapes::ShapeDefinition<T>,
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
        .append_pair("table", shape.table);

    // Set WHERE clause with parameterized values
    origin_url
        .query_pairs_mut()
        .append_pair("where", shape.where_clause);

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
