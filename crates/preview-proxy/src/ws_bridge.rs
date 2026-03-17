use relay_tunnel::ws_io::{axum_ws_stream_io, tungstenite_ws_stream_io};
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
    client_socket: axum::extract::ws::WebSocket,
) -> anyhow::Result<()> {
    let mut upstream_io = tungstenite_ws_stream_io(upstream);
    let mut client_io = axum_ws_stream_io(client_socket);
    tokio::io::copy_bidirectional(&mut upstream_io, &mut client_io).await?;
    Ok(())
}
