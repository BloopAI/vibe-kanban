use axum::{
    Router,
    extract::{
        Path, Request, State,
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

type MaybeWsUpgrade = Result<WebSocketUpgrade, WebSocketUpgradeRejection>;

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/host/{host_id}/{*tail}", any(proxy_host_request))
}

async fn proxy_host_request(
    State(deployment): State<DeploymentImpl>,
    Path((host_id, tail)): Path<(Uuid, String)>,
    ws_upgrade: MaybeWsUpgrade,
    mut request: Request,
) -> Response {
    let query = request.uri().query().map(str::to_owned);
    let upstream_uri = match upstream_api_uri(&tail, query.as_deref()) {
        Ok(uri) => uri,
        Err(error) => return error.into_response(),
    };
    *request.uri_mut() = upstream_uri;

    let mut connection = match RelayConnection::for_host(&deployment, host_id).await {
        Ok(connection) => connection,
        Err(error) => return error.into_response(),
    };

    let response = match ws_upgrade {
        Ok(ws_upgrade) => connection.forward_ws(request, ws_upgrade).await,
        Err(_) => connection.forward_http(request).await,
    };

    response.unwrap_or_else(IntoResponse::into_response)
}

fn upstream_api_uri(tail: &str, query: Option<&str>) -> Result<Uri, RelayProxyError> {
    let mut uri = String::from("/api/");
    uri.push_str(tail);

    if let Some(query) = query {
        uri.push('?');
        uri.push_str(query);
    }

    uri.parse()
        .map_err(|_| RelayProxyError::BadRequest("Invalid rewritten relay path"))
}
