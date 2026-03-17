use std::{
    future::poll_fn,
    pin::Pin,
    task::{Context, Poll, ready},
};

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::{
    Sink, SinkExt, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use relay_tunnel::ws_io::{AxumWsStreamIo, axum_ws_stream_io};
use relay_ws_crypto::{InboundRelayVerifier, OutboundRelaySigner, RelaySessionCrypto};
use relay_ws_protocol::{RelayClose, RelayMessage};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

pub struct RelaySocket {
    inner: RelaySocketInner,
}

enum RelaySocketInner {
    Plain(WebSocket),
    Signed(SignedAxumSocket),
}

impl RelaySocket {
    pub fn plain(socket: WebSocket) -> Self {
        Self {
            inner: RelaySocketInner::Plain(socket),
        }
    }

    pub fn signed(
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
        socket: WebSocket,
    ) -> Self {
        Self {
            inner: RelaySocketInner::Signed(SignedAxumSocket::new(
                signing_session_id,
                request_nonce,
                signing_key,
                peer_verify_key,
                socket,
            )),
        }
    }

    pub async fn send(&mut self, message: Message) -> anyhow::Result<()> {
        match &mut self.inner {
            RelaySocketInner::Plain(socket) => {
                socket.send(message).await.map_err(anyhow::Error::from)
            }
            RelaySocketInner::Signed(socket) => socket.send_axum_message(message).await,
        }
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<Message>> {
        match &mut self.inner {
            RelaySocketInner::Plain(socket) => match socket.next().await {
                Some(Ok(message)) => Ok(Some(message)),
                Some(Err(error)) => Err(anyhow::Error::from(error)),
                None => Ok(None),
            },
            RelaySocketInner::Signed(socket) => socket.recv_axum_message().await,
        }
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        match &mut self.inner {
            RelaySocketInner::Plain(socket) => socket.close().await.map_err(anyhow::Error::from),
            RelaySocketInner::Signed(socket) => socket.close().await,
        }
    }
}

pub struct RelayTunnel {
    inner: RelayTunnelInner,
}

enum RelayTunnelInner {
    Plain(AxumWsStreamIo<WebSocket>),
    Signed(SignedAxumTunnel),
}

impl RelayTunnel {
    pub fn plain(socket: WebSocket) -> Self {
        Self {
            inner: RelayTunnelInner::Plain(axum_ws_stream_io(socket)),
        }
    }

    pub fn signed(
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
        socket: WebSocket,
    ) -> Self {
        Self {
            inner: RelayTunnelInner::Signed(SignedAxumTunnel::new(
                signing_session_id,
                request_nonce,
                signing_key,
                peer_verify_key,
                socket,
            )),
        }
    }
}

impl AsyncRead for RelayTunnel {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        match &mut this.inner {
            RelayTunnelInner::Plain(io) => Pin::new(io).poll_read(cx, buf),
            RelayTunnelInner::Signed(io) => Pin::new(io).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for RelayTunnel {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let this = self.get_mut();
        match &mut this.inner {
            RelayTunnelInner::Plain(io) => Pin::new(io).poll_write(cx, buf),
            RelayTunnelInner::Signed(io) => Pin::new(io).poll_write(cx, buf),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        match &mut this.inner {
            RelayTunnelInner::Plain(io) => Pin::new(io).poll_flush(cx),
            RelayTunnelInner::Signed(io) => Pin::new(io).poll_flush(cx),
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        match &mut this.inner {
            RelayTunnelInner::Plain(io) => Pin::new(io).poll_shutdown(cx),
            RelayTunnelInner::Signed(io) => Pin::new(io).poll_shutdown(cx),
        }
    }
}

struct SignedAxumSocket {
    sender: SignedAxumSender,
    receiver: SignedAxumReceiver,
}

impl SignedAxumSocket {
    fn new(
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
        socket: WebSocket,
    ) -> Self {
        let (sink, stream) = socket.split();
        let session = RelaySessionCrypto::new(
            signing_session_id,
            request_nonce,
            signing_key,
            peer_verify_key,
        );

        Self {
            sender: SignedAxumSender::new(OutboundRelaySigner::new(&session), sink),
            receiver: SignedAxumReceiver::new(InboundRelayVerifier::new(&session), stream),
        }
    }

    async fn send_axum_message(&mut self, message: Message) -> anyhow::Result<()> {
        self.sender
            .send_message(axum_message_to_relay(message)?)
            .await
    }

    async fn recv_axum_message(&mut self) -> anyhow::Result<Option<Message>> {
        self.receiver
            .recv_message()
            .await?
            .map(relay_message_to_axum)
            .transpose()
    }

    async fn close(&mut self) -> anyhow::Result<()> {
        self.sender.close().await
    }
}

struct SignedAxumTunnel {
    writer: TunnelWriter,
    reader: TunnelReader,
    read_buf: Vec<u8>,
    flushing: bool,
}

impl Unpin for SignedAxumTunnel {}

impl SignedAxumTunnel {
    fn new(
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
        socket: WebSocket,
    ) -> Self {
        let (sink, stream) = socket.split();
        let session = RelaySessionCrypto::new(
            signing_session_id,
            request_nonce,
            signing_key,
            peer_verify_key,
        );

        Self {
            writer: TunnelWriter::new(OutboundRelaySigner::new(&session), sink),
            reader: TunnelReader::new(InboundRelayVerifier::new(&session), stream),
            read_buf: Vec::new(),
            flushing: false,
        }
    }
}

impl AsyncRead for SignedAxumTunnel {
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

            let payload = match ready!(this.reader.poll_recv_chunk(cx)) {
                Ok(Some(payload)) => payload,
                Ok(None) => return Poll::Ready(Ok(())),
                Err(error) => return Poll::Ready(Err(std::io::Error::other(error.to_string()))),
            };

            this.read_buf.extend_from_slice(&payload);
        }
    }
}

impl AsyncWrite for SignedAxumTunnel {
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
            ready!(this.writer.poll_ready(cx))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            this.writer
                .start_send_chunk(buf)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            this.flushing = true;
        }

        ready!(this.writer.poll_flush(cx))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        this.flushing = false;

        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(this.writer.poll_flush(cx))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        this.flushing = false;
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(this.writer.poll_close(cx))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        this.flushing = false;
        Poll::Ready(Ok(()))
    }
}

struct SignedAxumSender {
    sink: SplitSink<WebSocket, Message>,
    signer: OutboundRelaySigner,
}

impl SignedAxumSender {
    fn new(signer: OutboundRelaySigner, sink: SplitSink<WebSocket, Message>) -> Self {
        Self { sink, signer }
    }

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_ready(cx)
            .map_err(anyhow::Error::from)
    }

    fn start_send_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        let envelope_bytes = self.signer.sign_message_bytes(message)?;
        Pin::new(&mut self.sink)
            .start_send(Message::Binary(envelope_bytes.into()))
            .map_err(anyhow::Error::from)
    }

    fn poll_flush(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_flush(cx)
            .map_err(anyhow::Error::from)
    }

    fn poll_close(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_close(cx)
            .map_err(anyhow::Error::from)
    }

    async fn send_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_ready(cx)).await?;
        self.start_send_message(message)?;
        poll_fn(|cx| self.poll_flush(cx)).await
    }

    async fn close(&mut self) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_close(cx)).await
    }
}

struct SignedAxumReceiver {
    stream: SplitStream<WebSocket>,
    verifier: InboundRelayVerifier,
}

impl SignedAxumReceiver {
    fn new(verifier: InboundRelayVerifier, stream: SplitStream<WebSocket>) -> Self {
        Self { stream, verifier }
    }

    fn poll_recv_message(
        &mut self,
        cx: &mut Context<'_>,
    ) -> Poll<anyhow::Result<Option<RelayMessage>>> {
        loop {
            let Some(result) = ready!(Pin::new(&mut self.stream).poll_next(cx)) else {
                return Poll::Ready(Ok(None));
            };
            let transport_message = result.map_err(anyhow::Error::from)?;

            let relay_message = match transport_message {
                Message::Text(text) => self
                    .verifier
                    .verify_envelope_bytes(text.to_string().as_bytes())?,
                Message::Binary(payload) => {
                    self.verifier.verify_envelope_bytes(payload.as_ref())?
                }
                Message::Ping(_) | Message::Pong(_) => continue,
                Message::Close(_) => return Poll::Ready(Ok(None)),
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

    async fn recv_message(&mut self) -> anyhow::Result<Option<RelayMessage>> {
        poll_fn(|cx| self.poll_recv_message(cx)).await
    }
}

struct TunnelWriter {
    sink: SplitSink<WebSocket, Message>,
    signer: OutboundRelaySigner,
}

impl TunnelWriter {
    fn new(signer: OutboundRelaySigner, sink: SplitSink<WebSocket, Message>) -> Self {
        Self { sink, signer }
    }

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_ready(cx)
            .map_err(anyhow::Error::from)
    }

    fn start_send_chunk(&mut self, chunk: &[u8]) -> anyhow::Result<()> {
        let envelope_bytes = self
            .signer
            .sign_message_bytes(RelayMessage::Binary(chunk.to_vec()))?;
        Pin::new(&mut self.sink)
            .start_send(Message::Binary(envelope_bytes.into()))
            .map_err(anyhow::Error::from)
    }

    fn poll_flush(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_flush(cx)
            .map_err(anyhow::Error::from)
    }

    fn poll_close(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_close(cx)
            .map_err(anyhow::Error::from)
    }
}

struct TunnelReader {
    stream: SplitStream<WebSocket>,
    verifier: InboundRelayVerifier,
}

impl TunnelReader {
    fn new(verifier: InboundRelayVerifier, stream: SplitStream<WebSocket>) -> Self {
        Self { stream, verifier }
    }

    fn poll_recv_chunk(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<Option<Vec<u8>>>> {
        loop {
            let Some(result) = ready!(Pin::new(&mut self.stream).poll_next(cx)) else {
                return Poll::Ready(Ok(None));
            };
            let transport_message = result.map_err(anyhow::Error::from)?;

            let relay_message = match transport_message {
                Message::Text(text) => self
                    .verifier
                    .verify_envelope_bytes(text.to_string().as_bytes())?,
                Message::Binary(payload) => {
                    self.verifier.verify_envelope_bytes(payload.as_ref())?
                }
                Message::Ping(_) | Message::Pong(_) => continue,
                Message::Close(_) => return Poll::Ready(Ok(None)),
            };

            match relay_message {
                RelayMessage::Binary(payload) => return Poll::Ready(Ok(Some(payload))),
                RelayMessage::Text(text) => return Poll::Ready(Ok(Some(text.into_bytes()))),
                RelayMessage::Ping(_) | RelayMessage::Pong(_) => continue,
                RelayMessage::Close(_) => return Poll::Ready(Ok(None)),
            }
        }
    }
}

fn axum_message_to_relay(message: Message) -> anyhow::Result<RelayMessage> {
    Ok(match message {
        Message::Text(text) => RelayMessage::Text(text.to_string()),
        Message::Binary(payload) => RelayMessage::Binary(payload.to_vec()),
        Message::Ping(payload) => RelayMessage::Ping(payload.to_vec()),
        Message::Pong(payload) => RelayMessage::Pong(payload.to_vec()),
        Message::Close(close) => RelayMessage::Close(close.map(axum_close_to_relay)),
    })
}

fn relay_message_to_axum(message: RelayMessage) -> anyhow::Result<Message> {
    Ok(match message {
        RelayMessage::Text(text) => Message::Text(text.into()),
        RelayMessage::Binary(payload) => Message::Binary(payload.into()),
        RelayMessage::Ping(payload) => Message::Ping(payload.into()),
        RelayMessage::Pong(payload) => Message::Pong(payload.into()),
        RelayMessage::Close(close) => Message::Close(close.map(relay_close_to_axum)),
    })
}

fn relay_close_to_axum(close: RelayClose) -> CloseFrame {
    CloseFrame {
        code: close.code,
        reason: close.reason.into(),
    }
}

fn axum_close_to_relay(close: CloseFrame) -> RelayClose {
    RelayClose {
        code: close.code,
        reason: close.reason.to_string(),
    }
}
