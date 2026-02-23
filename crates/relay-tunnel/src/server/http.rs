use axum::{
    body::Body,
    extract::Request,
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};
use hyper::{client::conn::http1 as client_http1, upgrade};
use hyper_util::rt::TokioIo;
use tokio::sync::Mutex;
use tokio_yamux::Control;

/// Proxies one HTTP request over a new yamux stream using the shared control.
pub async fn proxy_request_over_control(
    control: &Mutex<Control>,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let stream = {
        let mut control = control.lock().await;
        match control.open_stream().await {
            Ok(stream) => stream,
            Err(error) => {
                tracing::warn!(?error, "failed to open relay stream");
                return (StatusCode::BAD_GATEWAY, "Relay connection lost").into_response();
            }
        }
    };

    let (mut parts, body) = request.into_parts();
    let path = normalized_relay_path(&parts.uri, strip_prefix);
    parts.uri = match Uri::builder().path_and_query(path).build() {
        Ok(uri) => uri,
        Err(error) => {
            tracing::warn!(?error, "failed to build relay proxy URI");
            return (StatusCode::BAD_REQUEST, "Invalid request URI").into_response();
        }
    };

    let mut outbound = axum::http::Request::from_parts(parts, body);
    let request_upgrade = upgrade::on(&mut outbound);

    let (mut sender, connection) = match client_http1::Builder::new()
        .handshake(TokioIo::new(stream))
        .await
    {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(?error, "failed to initialize relay stream proxy connection");
            return (StatusCode::BAD_GATEWAY, "Relay connection failed").into_response();
        }
    };

    tokio::spawn(async move {
        if let Err(error) = connection.with_upgrades().await {
            tracing::debug!(?error, "relay stream connection closed");
        }
    });

    let mut response = match sender.send_request(outbound).await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(?error, "relay proxy request failed");
            return (StatusCode::BAD_GATEWAY, "Relay request failed").into_response();
        }
    };

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        let response_upgrade = upgrade::on(&mut response);
        tokio::spawn(async move {
            let Ok(from_client) = request_upgrade.await else {
                return;
            };
            let Ok(to_local) = response_upgrade.await else {
                return;
            };
            let mut from_client = TokioIo::new(from_client);
            let mut to_local = TokioIo::new(to_local);
            let _ = tokio::io::copy_bidirectional(&mut from_client, &mut to_local).await;
        });
    }

    let (parts, body) = response.into_parts();
    Response::from_parts(parts, Body::new(body))
}

fn normalized_relay_path(uri: &axum::http::Uri, strip_prefix: &str) -> String {
    let raw_path = uri.path();
    let path = raw_path.strip_prefix(strip_prefix).unwrap_or(raw_path);
    let path = if path.is_empty() { "/" } else { path };
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    format!("{path}{query}")
}
