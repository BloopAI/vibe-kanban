use axum::extract::ws::Message as AxumWsMessage;
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use tokio_tungstenite::{tungstenite, tungstenite::client::IntoClientRequest};

use crate::ws_io::{axum_to_tungstenite, tungstenite_to_axum};

type BridgeSourceError = Box<dyn std::error::Error + Send + Sync + 'static>;

#[derive(Debug, thiserror::Error)]
pub enum WsBridgeError {
    #[error("WebSocket bridge read from source stream failed")]
    ReadFromSource(#[source] BridgeSourceError),
    #[error("WebSocket bridge write to destination sink failed")]
    WriteToDestination(#[source] BridgeSourceError),
    #[error("WebSocket bridge read from destination stream failed")]
    ReadFromDestination(#[source] BridgeSourceError),
    #[error("WebSocket bridge write to source sink failed")]
    WriteToSource(#[source] BridgeSourceError),
}

#[derive(Debug, thiserror::Error)]
pub enum UpstreamWsConnectError {
    #[error(transparent)]
    Tungstenite(#[from] tokio_tungstenite::tungstenite::Error),
    #[error(transparent)]
    InvalidProtocolHeader(#[from] http::header::InvalidHeaderValue),
}

type UpstreamWebSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// Connect to an upstream websocket endpoint and optionally negotiate subprotocols.
pub async fn connect_upstream_ws(
    ws_url: String,
    protocols: Option<&str>,
) -> Result<(UpstreamWebSocket, Option<String>), UpstreamWsConnectError> {
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

/// Like `tokio::io::copy_bidirectional` but operates on typed WS messages
/// instead of raw bytes, preserving message types across the bridge via the
/// provided conversion functions.
async fn ws_copy_bidirectional<A, B, MA, MB, EA, EB>(
    a: A,
    b: B,
    a_to_b: fn(MA) -> MB,
    b_to_a: fn(MB) -> MA,
) -> Result<(), WsBridgeError>
where
    A: Stream<Item = Result<MA, EA>> + futures_util::Sink<MA, Error = EA> + Unpin,
    B: Stream<Item = Result<MB, EB>> + futures_util::Sink<MB, Error = EB> + Unpin,
    EA: Into<BridgeSourceError>,
    EB: Into<BridgeSourceError>,
{
    let (mut a_sink, mut a_stream) = a.split();
    let (mut b_sink, mut b_stream) = b.split();

    let forward = async {
        while let Some(msg) = a_stream.next().await {
            let msg = msg.map_err(|error| WsBridgeError::ReadFromSource(error.into()))?;
            b_sink
                .send(a_to_b(msg))
                .await
                .map_err(|error| WsBridgeError::WriteToDestination(error.into()))?;
        }
        let _ = b_sink.close().await;
        Ok::<(), WsBridgeError>(())
    };

    let backward = async {
        while let Some(msg) = b_stream.next().await {
            let msg = msg.map_err(|error| WsBridgeError::ReadFromDestination(error.into()))?;
            a_sink
                .send(b_to_a(msg))
                .await
                .map_err(|error| WsBridgeError::WriteToSource(error.into()))?;
        }
        let _ = a_sink.close().await;
        Ok::<(), WsBridgeError>(())
    };

    tokio::select! {
        result = forward => result,
        result = backward => result,
    }
}

/// Convenience axum websocket bridge into an upstream tungstenite socket.
pub async fn bridge_axum_ws<A, B, EA, EB>(
    client_socket: A,
    upstream: B,
) -> Result<(), WsBridgeError>
where
    A: Stream<Item = Result<AxumWsMessage, EA>> + Sink<AxumWsMessage, Error = EA> + Unpin,
    B: Stream<Item = Result<tungstenite::Message, EB>>
        + Sink<tungstenite::Message, Error = EB>
        + Unpin,
    EA: Into<BridgeSourceError>,
    EB: Into<BridgeSourceError>,
{
    ws_copy_bidirectional(
        client_socket,
        upstream,
        axum_to_tungstenite,
        tungstenite_to_axum,
    )
    .await
}

/// Bridge two tungstenite websocket streams while preserving frame types.
pub async fn bridge_tungstenite_ws<A, B, EA, EB>(a: A, b: B) -> Result<(), WsBridgeError>
where
    A: Stream<Item = Result<tungstenite::Message, EA>>
        + futures_util::Sink<tungstenite::Message, Error = EA>
        + Unpin,
    B: Stream<Item = Result<tungstenite::Message, EB>>
        + futures_util::Sink<tungstenite::Message, Error = EB>
        + Unpin,
    EA: Into<BridgeSourceError>,
    EB: Into<BridgeSourceError>,
{
    ws_copy_bidirectional(a, b, std::convert::identity, std::convert::identity).await
}
