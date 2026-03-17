use std::{
    future::poll_fn,
    pin::Pin,
    task::{Context, Poll, ready},
};

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures_util::{
    Sink, SinkExt, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use relay_tunnel::ws_io::{AxumWsStreamIo, axum_ws_stream_io};
use relay_ws_client::{RelayUpstreamReceiver, RelayUpstreamSender, RelayUpstreamSocket};
use relay_ws_crypto::{InboundRelayVerifier, OutboundRelaySigner, RelaySessionCrypto};
use relay_ws_protocol::{RelayClose, RelayMessage};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

pub struct RelayServerSocket {
    inner: RelayServerSocketInner,
}

enum RelayServerSocketInner {
    Plain(WebSocket),
    Signed(SignedAxumSocket),
}

impl RelayServerSocket {
    pub fn plain(socket: WebSocket) -> Self {
        Self {
            inner: RelayServerSocketInner::Plain(socket),
        }
    }

    pub fn signed(session_crypto: RelaySessionCrypto, socket: WebSocket) -> Self {
        Self {
            inner: RelayServerSocketInner::Signed(SignedAxumSocket::new(session_crypto, socket)),
        }
    }

    pub async fn send(&mut self, message: Message) -> anyhow::Result<()> {
        match &mut self.inner {
            RelayServerSocketInner::Plain(socket) => {
                socket.send(message).await.map_err(anyhow::Error::from)
            }
            RelayServerSocketInner::Signed(socket) => socket.send_axum_message(message).await,
        }
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<Message>> {
        match &mut self.inner {
            RelayServerSocketInner::Plain(socket) => match socket.next().await {
                Some(Ok(message)) => Ok(Some(message)),
                Some(Err(error)) => Err(anyhow::Error::from(error)),
                None => Ok(None),
            },
            RelayServerSocketInner::Signed(socket) => socket.recv_axum_message().await,
        }
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        match &mut self.inner {
            RelayServerSocketInner::Plain(socket) => {
                socket.close().await.map_err(anyhow::Error::from)
            }
            RelayServerSocketInner::Signed(socket) => socket.close().await,
        }
    }

    pub fn into_tunnel_stream(self) -> RelayTunnelStream {
        match self.inner {
            RelayServerSocketInner::Plain(socket) => {
                RelayTunnelStream::Plain(axum_ws_stream_io(socket))
            }
            RelayServerSocketInner::Signed(socket) => {
                RelayTunnelStream::Signed(SignedAxumTunnelStream::new(socket))
            }
        }
    }
}

struct SignedAxumSocket {
    sender: SignedAxumSender,
    receiver: SignedAxumReceiver,
}

impl SignedAxumSocket {
    fn new(session_crypto: RelaySessionCrypto, socket: WebSocket) -> Self {
        let (sink, stream) = socket.split();
        Self {
            sender: SignedAxumSender::new(OutboundRelaySigner::new(&session_crypto), sink),
            receiver: SignedAxumReceiver::new(InboundRelayVerifier::new(&session_crypto), stream),
        }
    }

    fn split(self) -> (SignedAxumSender, SignedAxumReceiver) {
        (self.sender, self.receiver)
    }

    async fn send_axum_message(&mut self, message: Message) -> anyhow::Result<()> {
        self.sender
            .send_relay_message(axum_message_to_relay(message)?)
            .await
    }

    async fn recv_axum_message(&mut self) -> anyhow::Result<Option<Message>> {
        self.receiver
            .recv_relay_message()
            .await?
            .map(relay_message_to_axum)
            .transpose()
    }

    async fn close(&mut self) -> anyhow::Result<()> {
        self.sender.close().await
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

    fn start_send_relay_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
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

    async fn send_relay_message(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_ready(cx)).await?;
        self.start_send_relay_message(message)?;
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

    fn poll_recv_relay_message(
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

    async fn recv_relay_message(&mut self) -> anyhow::Result<Option<RelayMessage>> {
        poll_fn(|cx| self.poll_recv_relay_message(cx)).await
    }
}

pub enum RelayTunnelStream {
    Plain(AxumWsStreamIo<WebSocket>),
    Signed(SignedAxumTunnelStream),
}

pub struct SignedAxumTunnelStream {
    sender: SignedAxumSender,
    receiver: SignedAxumReceiver,
    read_buf: Vec<u8>,
    flushing: bool,
}

impl Unpin for SignedAxumTunnelStream {}

impl SignedAxumTunnelStream {
    fn new(socket: SignedAxumSocket) -> Self {
        let (sender, receiver) = socket.split();
        Self {
            sender,
            receiver,
            read_buf: Vec::new(),
            flushing: false,
        }
    }
}

impl AsyncRead for SignedAxumTunnelStream {
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

impl AsyncWrite for SignedAxumTunnelStream {
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

impl AsyncRead for RelayTunnelStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        match this {
            RelayTunnelStream::Plain(io) => Pin::new(io).poll_read(cx, buf),
            RelayTunnelStream::Signed(io) => Pin::new(io).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for RelayTunnelStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let this = self.get_mut();
        match this {
            RelayTunnelStream::Plain(io) => Pin::new(io).poll_write(cx, buf),
            RelayTunnelStream::Signed(io) => Pin::new(io).poll_write(cx, buf),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        match this {
            RelayTunnelStream::Plain(io) => Pin::new(io).poll_flush(cx),
            RelayTunnelStream::Signed(io) => Pin::new(io).poll_flush(cx),
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        match this {
            RelayTunnelStream::Plain(io) => Pin::new(io).poll_shutdown(cx),
            RelayTunnelStream::Signed(io) => Pin::new(io).poll_shutdown(cx),
        }
    }
}

pub async fn bridge_axum_client_to_upstream(
    upstream: RelayUpstreamSocket,
    client_socket: WebSocket,
) -> anyhow::Result<()> {
    let (mut upstream_sender, mut upstream_receiver) = upstream.split();
    let (mut client_sender, mut client_receiver) = client_socket.split();

    let client_to_upstream = tokio::spawn(async move {
        bridge_client_to_upstream(&mut client_receiver, &mut upstream_sender).await
    });

    let upstream_to_client = tokio::spawn(async move {
        bridge_upstream_to_client(&mut upstream_receiver, &mut client_sender).await
    });

    tokio::select! {
        result = client_to_upstream => {
            result??;
        }
        result = upstream_to_client => {
            result??;
        }
    }

    Ok(())
}

async fn bridge_client_to_upstream(
    client_receiver: &mut SplitStream<WebSocket>,
    upstream_sender: &mut RelayUpstreamSender,
) -> anyhow::Result<()> {
    while let Some(message_result) = client_receiver.next().await {
        let message = message_result?;
        let should_close = matches!(message, Message::Close(_));
        upstream_sender
            .send_relay_message(axum_message_to_relay(message)?)
            .await?;
        if should_close {
            break;
        }
    }

    let _ = upstream_sender.close().await;
    Ok(())
}

async fn bridge_upstream_to_client(
    upstream_receiver: &mut RelayUpstreamReceiver,
    client_sender: &mut SplitSink<WebSocket, Message>,
) -> anyhow::Result<()> {
    while let Some(message) = upstream_receiver.recv_relay_message().await? {
        client_sender.send(relay_message_to_axum(message)?).await?;
    }

    let _ = client_sender.close().await;
    Ok(())
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
