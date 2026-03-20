use axum::{
    Router,
    extract::{Path, Request, State, ws::rejection::WebSocketUpgradeRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::any,
};
use deployment::Deployment;
use relay_tunnel_core::ws_io::{axum_to_tungstenite, tungstenite_to_axum, ws_copy_bidirectional};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::{DeploymentImpl, middleware::signed_ws::SignedWsUpgrade};

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
    ws_upgrade: Result<SignedWsUpgrade, WebSocketUpgradeRejection>,
    request: Request,
) -> Response {
    match ws_upgrade {
        Ok(ws) => forward_preview_ws(ws, target_port, String::new(), request).await,
        Err(rejection) => {
            preview_proxy::proxy_api_request(
                deployment.preview_proxy(),
                target_port,
                String::new(),
                Err(rejection),
                request,
            )
            .await
        }
    }
}

async fn proxy_preview_request(
    State(deployment): State<DeploymentImpl>,
    Path((target_port, tail)): Path<(u16, String)>,
    ws_upgrade: Result<SignedWsUpgrade, WebSocketUpgradeRejection>,
    request: Request,
) -> Response {
    match ws_upgrade {
        Ok(ws) => forward_preview_ws(ws, target_port, tail, request).await,
        Err(rejection) => {
            preview_proxy::proxy_api_request(
                deployment.preview_proxy(),
                target_port,
                tail,
                Err(rejection),
                request,
            )
            .await
        }
    }
}

async fn forward_preview_ws(
    ws: SignedWsUpgrade,
    target_port: u16,
    tail: String,
    request: Request,
) -> Response {
    let query = request.uri().query().unwrap_or_default();
    let normalized = tail.trim_start_matches('/');
    let ws_url = if normalized.is_empty() {
        format!("ws://localhost:{target_port}/?{query}")
    } else if query.is_empty() {
        format!("ws://localhost:{target_port}/{normalized}")
    } else {
        format!("ws://localhost:{target_port}/{normalized}?{query}")
    };

    let protocols = request
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned);

    let (upstream_ws, selected_protocol) =
        match connect_upstream_ws(&ws_url, protocols.as_deref()).await {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(?error, "Failed to connect preview upstream WebSocket");
                return (StatusCode::BAD_GATEWAY, "Preview WebSocket unavailable").into_response();
            }
        };

    let ws = if let Some(protocol) = selected_protocol {
        ws.protocols([protocol])
    } else {
        ws
    };

    ws.on_upgrade(move |client| async move {
        if let Err(error) = ws_copy_bidirectional(
            client,
            upstream_ws,
            axum_to_tungstenite,
            tungstenite_to_axum,
        )
        .await
        {
            tracing::debug!(?error, "Preview WS bridge closed with error");
        }
    })
    .into_response()
}

async fn connect_upstream_ws(
    ws_url: &str,
    protocols: Option<&str>,
) -> anyhow::Result<(
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    Option<String>,
)> {
    let mut request = ws_url.into_client_request()?;
    if let Some(protocols) = protocols
        && !protocols.trim().is_empty()
    {
        request
            .headers_mut()
            .insert("sec-websocket-protocol", protocols.parse()?);
    }
    let (stream, response) = tokio_tungstenite::connect_async(request).await?;
    let selected_protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    Ok((stream, selected_protocol))
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
