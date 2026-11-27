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
    /// Boxed: the tungstenite error is large and would bloat every `Result`
    #[error(transparent)]
    Tungstenite(Box<tokio_tungstenite::tungstenite::Error>),
    #[error(transparent)]
    InvalidProtocolHeader(#[from] http::header::InvalidHeaderValue),
}

impl From<tokio_tungstenite::tungstenite::Error> for UpstreamWsConnectError {
    fn from(err: tokio_tungstenite::tungstenite::Error) -> Self {
        Self::Tungstenite(Box::new(err))
    }
}

type UpstreamWebSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// Connect to an upstream websocket endpoint and optionally negotiate subprotocols.
pub async fn connect_upstream_ws(
    ws_url: String,
    protocols: Option<&str>,
) -> Result<(UpstreamWebSocket, Option<String>), UpstreamWsConnectError> {
    connect_upstream_ws_with_headers(ws_url, protocols, &[]).await
}

/// Like [`connect_upstream_ws`], adding `headers` to the upgrade request.
/// Header names must be lowercase.
pub async fn connect_upstream_ws_with_headers(
    ws_url: String,
    protocols: Option<&str>,
    headers: &[(&'static str, &'static str)],
) -> Result<(UpstreamWebSocket, Option<String>), UpstreamWsConnectError> {
    let mut ws_request = ws_url.into_client_request()?;

    for (name, value) in headers {
        ws_request.headers_mut().insert(
            http::HeaderName::from_static(name),
            http::HeaderValue::from_static(value),
        );
    }

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

#[cfg(test)]
mod tests {
    use tokio::net::TcpListener;
    use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

    use super::connect_upstream_ws_with_headers;

    #[tokio::test]
    #[allow(clippy::result_large_err)] // tungstenite's handshake callback signature
    async fn extra_headers_reach_the_upstream_handshake() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut seen = None;
            let _ws =
                tokio_tungstenite::accept_hdr_async(stream, |req: &Request, res: Response| {
                    seen = req
                        .headers()
                        .get("x-test-marker")
                        .map(|v| v.to_str().unwrap().to_string());
                    Ok(res)
                })
                .await
                .unwrap();
            seen
        });

        let _upstream = connect_upstream_ws_with_headers(
            format!("ws://{addr}/socket"),
            None,
            &[("x-test-marker", "1")],
        )
        .await
        .unwrap();

        assert_eq!(server.await.unwrap().as_deref(), Some("1"));
    }
}
