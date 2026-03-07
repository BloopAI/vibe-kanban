use axum::{
    Router,
    extract::{
        OriginalUri, Path, Request, State,
        ws::{WebSocketUpgrade, rejection::WebSocketUpgradeRejection},
    },
    http::Uri,
    response::{IntoResponse, Response},
    routing::any,
};
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay::proxy::{RelayConnection, RelayProxyError},
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/host/{host_id}", any(proxy_host))
        .route("/host/{host_id}/{*tail}", any(proxy_host))
}

async fn proxy_host(
    State(deployment): State<DeploymentImpl>,
    Path(host_id): Path<Uuid>,
    ws_upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
    request: Request,
) -> Response {
    let request = match rewrite_relay_path(request, host_id) {
        Ok(r) => r,
        Err(e) => return e.into_response(),
    };
    let mut conn = match RelayConnection::for_host(&deployment, host_id).await {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };
    let result = match ws_upgrade {
        Ok(ws) => conn.forward_ws(request, ws).await,
        Err(_) => conn.forward_http(request).await,
    };
    result.unwrap_or_else(IntoResponse::into_response)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn rewrite_relay_path(request: Request, host_id: Uuid) -> Result<Request, RelayProxyError> {
    let original_uri = request
        .extensions()
        .get::<OriginalUri>()
        .map(|v| v.0.clone())
        .unwrap_or_else(|| request.uri().clone());

    let raw = original_uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or_else(|| original_uri.path());
    let prefix = format!("/api/host/{host_id}");
    let suffix = raw
        .strip_prefix(&prefix)
        .ok_or(RelayProxyError::BadRequest(
            "Request URI does not match host relay path",
        ))?;
    let new_uri: Uri = format!("/api{suffix}")
        .parse()
        .map_err(|_| RelayProxyError::BadRequest("Invalid rewritten relay path"))?;

    let (mut parts, body) = request.into_parts();
    parts.uri = new_uri;
    Ok(Request::from_parts(parts, body))
}
