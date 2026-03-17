use std::{
    future::poll_fn,
    pin::Pin,
    task::{Context, Poll, ready},
};

use ed25519_dalek::{SigningKey, VerifyingKey};
#[cfg(feature = "axum")]
use futures_util::SinkExt;
use futures_util::{
    Sink, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use relay_ws_crypto::{InboundRelayVerifier, OutboundRelaySigner, RelaySessionCrypto};
#[cfg(feature = "axum")]
use relay_ws_protocol::RelayClose;
use relay_ws_protocol::RelayMessage;
use tokio_tungstenite::tungstenite;

use crate::RelayWsStream;

pub struct RelaySocket {
    sender: SignedSender,
    receiver: SignedReceiver,
}

impl RelaySocket {
    pub(crate) fn new(
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
        stream: RelayWsStream,
    ) -> Self {
        let (sink, stream) = stream.split();
        let session = RelaySessionCrypto::new(
            signing_session_id,
            request_nonce,
            signing_key,
            peer_verify_key,
        );

        Self {
            sender: SignedSender::new(OutboundRelaySigner::new(&session), sink),
            receiver: SignedReceiver::new(InboundRelayVerifier::new(&session), stream),
        }
    }

    pub async fn send(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        self.sender.send(message).await
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<RelayMessage>> {
        self.receiver.recv().await
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        self.sender.close().await
    }

    #[cfg(feature = "axum")]
    pub async fn bridge_axum_client(
        self,
        client_socket: axum::extract::ws::WebSocket,
    ) -> anyhow::Result<()> {
        let (mut relay_sender, mut relay_receiver) = self.split();
        let (mut client_sender, mut client_receiver) = client_socket.split();

        let client_to_relay = tokio::spawn(async move {
            while let Some(message_result) = client_receiver.next().await {
                let message = axum_message_to_relay(message_result?)?;
                let should_close = message.is_close();
                relay_sender.send(message).await?;
                if should_close {
                    break;
                }
            }

            let _ = relay_sender.close().await;
            Ok::<(), anyhow::Error>(())
        });

        let relay_to_client = tokio::spawn(async move {
            while let Some(message) = relay_receiver.recv().await? {
                client_sender.send(relay_message_to_axum(message)?).await?;
            }

            let _ = client_sender.close().await;
            Ok::<(), anyhow::Error>(())
        });

        tokio::select! {
            result = client_to_relay => {
                result??;
            }
            result = relay_to_client => {
                result??;
            }
        }

        Ok(())
    }

    #[cfg(feature = "axum")]
    fn split(self) -> (SignedSender, SignedReceiver) {
        (self.sender, self.receiver)
    }
}

struct SignedSender {
    sink: SplitSink<RelayWsStream, tungstenite::Message>,
    signer: OutboundRelaySigner,
}

impl SignedSender {
    fn new(
        signer: OutboundRelaySigner,
        sink: SplitSink<RelayWsStream, tungstenite::Message>,
    ) -> Self {
        Self { sink, signer }
    }

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<()>> {
        Pin::new(&mut self.sink)
            .poll_ready(cx)
            .map_err(anyhow::Error::from)
    }

    fn start_send(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        let envelope_bytes = self.signer.sign_message_bytes(message)?;
        Pin::new(&mut self.sink)
            .start_send(tungstenite::Message::Binary(envelope_bytes.into()))
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

    async fn send(&mut self, message: RelayMessage) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_ready(cx)).await?;
        self.start_send(message)?;
        poll_fn(|cx| self.poll_flush(cx)).await
    }

    async fn close(&mut self) -> anyhow::Result<()> {
        poll_fn(|cx| self.poll_close(cx)).await
    }
}

struct SignedReceiver {
    stream: SplitStream<RelayWsStream>,
    verifier: InboundRelayVerifier,
}

impl SignedReceiver {
    fn new(verifier: InboundRelayVerifier, stream: SplitStream<RelayWsStream>) -> Self {
        Self { stream, verifier }
    }

    fn poll_recv(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<Option<RelayMessage>>> {
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

    async fn recv(&mut self) -> anyhow::Result<Option<RelayMessage>> {
        poll_fn(|cx| self.poll_recv(cx)).await
    }
}

#[cfg(feature = "axum")]
fn axum_message_to_relay(message: axum::extract::ws::Message) -> anyhow::Result<RelayMessage> {
    Ok(match message {
        axum::extract::ws::Message::Text(text) => RelayMessage::Text(text.to_string()),
        axum::extract::ws::Message::Binary(payload) => RelayMessage::Binary(payload.to_vec()),
        axum::extract::ws::Message::Ping(payload) => RelayMessage::Ping(payload.to_vec()),
        axum::extract::ws::Message::Pong(payload) => RelayMessage::Pong(payload.to_vec()),
        axum::extract::ws::Message::Close(close) => {
            RelayMessage::Close(close.map(axum_close_to_relay))
        }
    })
}

#[cfg(feature = "axum")]
fn relay_message_to_axum(message: RelayMessage) -> anyhow::Result<axum::extract::ws::Message> {
    Ok(match message {
        RelayMessage::Text(text) => axum::extract::ws::Message::Text(text.into()),
        RelayMessage::Binary(payload) => axum::extract::ws::Message::Binary(payload.into()),
        RelayMessage::Ping(payload) => axum::extract::ws::Message::Ping(payload.into()),
        RelayMessage::Pong(payload) => axum::extract::ws::Message::Pong(payload.into()),
        RelayMessage::Close(close) => {
            axum::extract::ws::Message::Close(close.map(relay_close_to_axum))
        }
    })
}

#[cfg(feature = "axum")]
fn relay_close_to_axum(close: RelayClose) -> axum::extract::ws::CloseFrame {
    axum::extract::ws::CloseFrame {
        code: close.code,
        reason: close.reason.into(),
    }
}

#[cfg(feature = "axum")]
fn axum_close_to_relay(close: axum::extract::ws::CloseFrame) -> RelayClose {
    RelayClose {
        code: close.code,
        reason: close.reason.to_string(),
    }
}
