use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{self, client::IntoClientRequest};

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
    let (mut upstream_sender, mut upstream_receiver) = upstream.split();
    let (mut client_sender, mut client_receiver) = client_socket.split();

    let client_to_upstream = tokio::spawn(async move {
        while let Some(msg_result) = client_receiver.next().await {
            let msg = msg_result?;
            let close = matches!(msg, Message::Close(_));
            let tungstenite_msg = match msg {
                Message::Text(text) => tungstenite::Message::Text(text.to_string().into()),
                Message::Binary(bytes) => tungstenite::Message::Binary(bytes.to_vec().into()),
                Message::Ping(bytes) => tungstenite::Message::Ping(bytes.to_vec().into()),
                Message::Pong(bytes) => tungstenite::Message::Pong(bytes.to_vec().into()),
                Message::Close(frame) => {
                    let close_frame = frame.map(|cf| tungstenite::protocol::CloseFrame {
                        code: tungstenite::protocol::frame::coding::CloseCode::from(cf.code),
                        reason: cf.reason.to_string().into(),
                    });
                    tungstenite::Message::Close(close_frame)
                }
            };

            upstream_sender.send(tungstenite_msg).await?;
            if close {
                break;
            }
        }
        let _ = upstream_sender.close().await;
        Ok::<(), anyhow::Error>(())
    });

    let upstream_to_client = tokio::spawn(async move {
        while let Some(msg_result) = upstream_receiver.next().await {
            let msg = msg_result?;
            let close = matches!(msg, tungstenite::Message::Close(_));
            let client_msg = match msg {
                tungstenite::Message::Text(text) => Message::Text(text.to_string().into()),
                tungstenite::Message::Binary(bytes) => Message::Binary(bytes.to_vec().into()),
                tungstenite::Message::Ping(bytes) => Message::Ping(bytes.to_vec().into()),
                tungstenite::Message::Pong(bytes) => Message::Pong(bytes.to_vec().into()),
                tungstenite::Message::Close(frame) => {
                    let close_frame = frame.map(|cf| axum::extract::ws::CloseFrame {
                        code: cf.code.into(),
                        reason: cf.reason.to_string().into(),
                    });
                    Message::Close(close_frame)
                }
                tungstenite::Message::Frame(_) => continue,
            };

            client_sender.send(client_msg).await?;
            if close {
                break;
            }
        }
        let _ = client_sender.close().await;
        Ok::<(), anyhow::Error>(())
    });

    tokio::select! {
        result = client_to_upstream => result??,
        result = upstream_to_client => result??,
    }

    Ok(())
}
