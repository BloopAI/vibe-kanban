use axum::{
    Router,
    extract::{
        Path, Request, State,
        ws::{WebSocketUpgrade, rejection::WebSocketUpgradeRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::any,
};
use deployment::Deployment;

use crate::DeploymentImpl;

type MaybeWsUpgrade = Result<WebSocketUpgrade, WebSocketUpgradeRejection>;

pub fn api_router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/preview/{target_port}", any(proxy_preview_request_no_tail))
        .route("/preview/{target_port}/{*tail}", any(proxy_preview_request))
}

pub fn subdomain_router(deployment: DeploymentImpl) -> Router {
    Router::new()
        .fallback(subdomain_proxy_request)
        .with_state(deployment)
}

async fn proxy_preview_request_no_tail(
    State(deployment): State<DeploymentImpl>,
    Path(target_port): Path<u16>,
    ws_upgrade: MaybeWsUpgrade,
    request: Request,
) -> Response {
    preview_proxy::proxy_api_request(
        deployment.preview_proxy(),
        target_port,
        String::new(),
        ws_upgrade,
        request,
    )
    .await
}

async fn proxy_preview_request(
    State(deployment): State<DeploymentImpl>,
    Path((target_port, tail)): Path<(u16, String)>,
    ws_upgrade: MaybeWsUpgrade,
    request: Request,
) -> Response {
    preview_proxy::proxy_api_request(
        deployment.preview_proxy(),
        target_port,
        tail,
        ws_upgrade,
        request,
    )
    .await
}

async fn subdomain_proxy_request(
    State(deployment): State<DeploymentImpl>,
    request: Request,
) -> Response {
    let Some(backend_port) = deployment.client_info().get_port() else {
        return (
            StatusCode::BAD_REQUEST,
            "Local backend port is not available",
        )
            .into_response();
    };

    let Some(proxy_port) = deployment.client_info().get_preview_proxy_port() else {
        return (
            StatusCode::BAD_REQUEST,
            "Preview proxy port is not available",
        )
            .into_response();
    };

    preview_proxy::proxy_subdomain_request(
        deployment.preview_proxy(),
        backend_port,
        proxy_port,
        request,
    )
    .await
}
