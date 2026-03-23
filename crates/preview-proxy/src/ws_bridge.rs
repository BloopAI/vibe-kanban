use axum::extract::ws::WebSocket;
use relay_tunnel_core::ws_io::{axum_to_tungstenite, tungstenite_to_axum, ws_copy_bidirectional};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

pub type UpstreamWebSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

pub async fn connect_upstream_ws(
    ws_url: String,
    protocols: Option<&str>,
) -> anyhow::Result<(UpstreamWebSocket, Option<String>)> {
    let mut ws_request = ws_url.into_client_request()?;

    if let Some(protocols) = protocols
        && !protocols.trim().is_empty()
    {
        ws_request
            .headers_mut()
            .insert("sec-websocket-protocol", protocols.parse()?);
    }

    let (upstream_ws, response) = tokio_tungstenite::connect_async(ws_request).await?;
    let selected_protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);

    Ok((upstream_ws, selected_protocol))
}

pub async fn bridge_ws(
    upstream: UpstreamWebSocket,
    client_socket: WebSocket,
) -> anyhow::Result<()> {
    ws_copy_bidirectional(
        client_socket,
        upstream,
        axum_to_tungstenite,
        tungstenite_to_axum,
    )
    .await
}
