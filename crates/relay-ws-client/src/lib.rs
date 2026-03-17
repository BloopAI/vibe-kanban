use std::{
    future::poll_fn,
    pin::Pin,
    task::{Context, Poll, ready},
};

use anyhow::Context as _;
use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::{
    Sink, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use relay_control::signing::{
    self, NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RequestSignature, SIGNING_SESSION_HEADER,
    TIMESTAMP_HEADER,
};
use relay_tunnel::{http_to_ws_url, tls::ws_connector};
use relay_ws_crypto::{InboundRelayVerifier, OutboundRelaySigner, RelaySessionCrypto};
use relay_ws_protocol::{RELAY_HEADER, RelayMessage};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::TcpStream,
};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async_tls_with_config,
    tungstenite::{self, client::IntoClientRequest},
};

pub type RelayWsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct RelayUpstreamSocket {
    sender: RelayUpstreamSender,
    receiver: RelayUpstreamReceiver,
}

impl RelayUpstreamSocket {
    pub fn from_stream(session_crypto: RelaySessionCrypto, stream: RelayWsStream) -> Self {
        let (sink, stream) = stream.split();
        Self {
            sender: RelayUpstreamSender::new(OutboundRelaySigner::new(&session_crypto), sink),
            receiver: RelayUpstreamReceiver::new(
                InboundRelayVerifier::new(&session_crypto),
                stream,
            ),
        }
    }

    pub fn split(self) -> (RelayUpstreamSender, RelayUpstreamReceiver) {
        (self.sender, self.receiver)
    }

    pub async fn send_relay_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        self.sender.send_relay_message(message).await
    }

    pub async fn recv_relay_message(&mut self) -> anyhow::Result<Option<RelayMessage>> {
        self.receiver.recv_relay_message().await
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        self.sender.close().await
    }

    pub fn into_tunnel_stream(self) -> RelayTunnelStream {
        RelayTunnelStream::from_parts(self.sender, self.receiver)
    }
}

pub struct RelayUpstreamSender {
    sink: SplitSink<RelayWsStream, tungstenite::Message>,
    signer: OutboundRelaySigner,
}

impl RelayUpstreamSender {
    fn new(
        signer: OutboundRelaySigner,
        sink: SplitSink<RelayWsStream, tungstenite::Message>,
    ) -> Self {
        Self { sink, signer }
    }

    pub fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_ready(cx)
            .map_err(anyhow::Error::from)
    }

    pub fn start_send_relay_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        let envelope_bytes = self.signer.sign_message_bytes(message)?;
        Pin::new(&mut self.sink)
            .start_send(tungstenite::Message::Binary(envelope_bytes.into()))
            .map_err(anyhow::Error::from)
    }

    pub fn poll_flush(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_flush(cx)
            .map_err(anyhow::Error::from)
    }

    pub fn poll_close(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_close(cx)
            .map_err(anyhow::Error::from)
    }

    pub async fn send_relay_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_ready(cx)).await?;
        self.start_send_relay_message(message)?;
        poll_fn(|cx| self.poll_flush(cx)).await
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_close(cx)).await
    }
}

pub struct RelayUpstreamReceiver {
    stream: SplitStream<RelayWsStream>,
    verifier: InboundRelayVerifier,
}

impl RelayUpstreamReceiver {
    fn new(verifier: InboundRelayVerifier, stream: SplitStream<RelayWsStream>) -> Self {
        Self { stream, verifier }
    }

    pub fn poll_recv_relay_message(
        &mut self,
        cx: &mut Context<'_>,
    ) -> Poll<anyhow::Result<Option<RelayMessage>>> {
        loop {
            let Some(result) = ready!(Pin::new(&mut self.stream).poll_next(cx)) else {
                return Poll::Ready(Ok(None));
            };
            let transport_message = result.map_err(anyhow::Error::from)?;

            let relay_message = match transport_message {
                tungstenite::Message::Text(text) => self
                    .verifier
                    .verify_envelope_bytes(text.to_string().as_bytes())?,
                tungstenite::Message::Binary(payload) => {
                    self.verifier.verify_envelope_bytes(payload.as_ref())?
                }
                tungstenite::Message::Ping(_) | tungstenite::Message::Pong(_) => continue,
                tungstenite::Message::Close(_) => return Poll::Ready(Ok(None)),
                tungstenite::Message::Frame(_) => continue,
            };

            if matches!(relay_message, RelayMessage::Ping(_) | RelayMessage::Pong(_)) {
                continue;
            }
            if relay_message.is_close() {
                return Poll::Ready(Ok(None));
            }

            return Poll::Ready(Ok(Some(relay_message)));
        }
    }

    pub async fn recv_relay_message(&mut self) -> anyhow::Result<Option<RelayMessage>> {
        poll_fn(|cx| self.poll_recv_relay_message(cx)).await
    }
}

pub struct RelayTunnelStream {
    sender: RelayUpstreamSender,
    receiver: RelayUpstreamReceiver,
    read_buf: Vec<u8>,
    flushing: bool,
}

impl Unpin for RelayTunnelStream {}

impl RelayTunnelStream {
    fn from_parts(sender: RelayUpstreamSender, receiver: RelayUpstreamReceiver) -> Self {
        Self {
            sender,
            receiver,
            read_buf: Vec::new(),
            flushing: false,
        }
    }
}

impl AsyncRead for RelayTunnelStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        loop {
            let this = self.as_mut().get_mut();

            if !this.read_buf.is_empty() {
                let n = buf.remaining().min(this.read_buf.len());
                buf.put_slice(&this.read_buf[..n]);
                this.read_buf.drain(..n);
                return Poll::Ready(Ok(()));
            }

            let relay_message = match ready!(this.receiver.poll_recv_relay_message(cx)) {
                Ok(Some(message)) => message,
                Ok(None) => return Poll::Ready(Ok(())),
                Err(error) => return Poll::Ready(Err(std::io::Error::other(error.to_string()))),
            };

            match relay_message {
                RelayMessage::Binary(payload) => this.read_buf.extend_from_slice(&payload),
                RelayMessage::Text(text) => this.read_buf.extend_from_slice(text.as_bytes()),
                RelayMessage::Ping(_) | RelayMessage::Pong(_) => continue,
                RelayMessage::Close(_) => return Poll::Ready(Ok(())),
            }
        }
    }
}

impl AsyncWrite for RelayTunnelStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        if buf.is_empty() {
            return Poll::Ready(Ok(0));
        }

        let this = self.as_mut().get_mut();
        if !this.flushing {
            ready!(this.sender.poll_ready(cx))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let relay_message = RelayMessage::Binary(buf.to_vec());
            this.sender
                .start_send_relay_message(relay_message)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            this.flushing = true;
        }

        ready!(this.sender.poll_flush(cx))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        this.flushing = false;

        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(this.sender.poll_flush(cx))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        this.flushing = false;
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(this.sender.poll_close(cx))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        this.flushing = false;
        Poll::Ready(Ok(()))
    }
}

#[derive(Debug)]
pub enum RelayWsConnectError {
    AuthFailure,
    Other(anyhow::Error),
}

pub async fn connect_signed_relay_websocket(
    relay_session_base_url: &str,
    target_path: &str,
    protocols: Option<&str>,
    signing_key: &SigningKey,
    signing_session_id: &str,
    server_verify_key: VerifyingKey,
) -> Result<(RelayUpstreamSocket, Option<String>), RelayWsConnectError> {
    let request_signature =
        signing::build_request_signature(signing_key, signing_session_id, "GET", target_path, &[]);
    let ws_url = http_to_ws_url(&format!(
        "{}{}",
        relay_session_base_url.trim_end_matches('/'),
        target_path
    ))
    .map_err(RelayWsConnectError::Other)?;

    let mut ws_request = ws_url
        .into_client_request()
        .context("Failed to build relay upstream WS request")
        .map_err(RelayWsConnectError::Other)?;

    if let Some(value) = protocols {
        ws_request.headers_mut().insert(
            "sec-websocket-protocol",
            value
                .parse()
                .map_err(anyhow::Error::from)
                .map_err(RelayWsConnectError::Other)?,
        );
    }

    set_ws_signing_headers(ws_request.headers_mut(), &request_signature);

    let (stream, response) =
        match connect_async_tls_with_config(ws_request, None, false, ws_connector()).await {
            Ok(result) => result,
            Err(tungstenite::Error::Http(response)) => {
                let status = response.status();
                if is_auth_failure_status(status) {
                    return Err(RelayWsConnectError::AuthFailure);
                }
                return Err(RelayWsConnectError::Other(anyhow::anyhow!(
                    "Relay WS handshake failed with status {status}"
                )));
            }
            Err(error) => return Err(RelayWsConnectError::Other(anyhow::Error::from(error))),
        };

    let selected_protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);

    let session_crypto = RelaySessionCrypto::new(
        request_signature.signing_session_id.clone(),
        request_signature.nonce.clone(),
        signing_key.clone(),
        server_verify_key,
    );
    let upstream_socket = RelayUpstreamSocket::from_stream(session_crypto, stream);

    Ok((upstream_socket, selected_protocol))
}

pub async fn connect_signed_tunnel_stream(
    relay_session_base_url: &str,
    target_path: &str,
    signing_key: &SigningKey,
    signing_session_id: &str,
    server_verify_key: VerifyingKey,
) -> Result<RelayTunnelStream, RelayWsConnectError> {
    let (socket, _selected_protocol) = connect_signed_relay_websocket(
        relay_session_base_url,
        target_path,
        None,
        signing_key,
        signing_session_id,
        server_verify_key,
    )
    .await?;

    Ok(socket.into_tunnel_stream())
}

fn set_ws_signing_headers(
    headers: &mut tungstenite::http::HeaderMap,
    signature: &RequestSignature,
) {
    headers.insert(RELAY_HEADER, "1".parse().expect("static header value"));
    headers.insert(
        SIGNING_SESSION_HEADER,
        signature
            .signing_session_id
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        TIMESTAMP_HEADER,
        signature
            .timestamp
            .to_string()
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        NONCE_HEADER,
        signature.nonce.parse().expect("valid header value"),
    );
    headers.insert(
        REQUEST_SIGNATURE_HEADER,
        signature.signature_b64.parse().expect("valid header value"),
    );
}

fn is_auth_failure_status(status: tungstenite::http::StatusCode) -> bool {
    status == tungstenite::http::StatusCode::UNAUTHORIZED
        || status == tungstenite::http::StatusCode::FORBIDDEN
}
