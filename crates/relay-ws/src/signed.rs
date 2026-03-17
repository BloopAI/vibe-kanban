//! Signed WebSocket channel.
//!
//! [`SignedWebSocket`] wraps a WS stream, signing outgoing frames via
//! [`WsFrameSigner::sign_frame`] and verifying incoming frames via
//! [`WsFrameVerifier::verify_frame`].

use std::{
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll},
};

use axum::extract::ws::{Message as AxumMessage, WebSocket};
use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite};

use crate::{
    crypto::{RelayWsFrame, RelayWsMessageType, WsFrameSigner, WsFrameVerifier},
    protocol::RelayTransportMessage,
};

pub type SignedTungsteniteSocket =
    SignedWebSocket<WebSocketStream<MaybeTlsStream<TcpStream>>, tungstenite::Message>;
pub type SignedAxumSocket = SignedWebSocket<WebSocket, AxumMessage>;

pub struct SignedWebSocket<S, M> {
    ws: S,
    signer: WsFrameSigner,
    verifier: WsFrameVerifier,
    _message: PhantomData<M>,
}

impl<S, M> SignedWebSocket<S, M> {
    fn new(
        ws: S,
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        peer_verify_key: VerifyingKey,
    ) -> Self {
        Self {
            ws,
            signer: WsFrameSigner::new(
                signing_session_id.clone(),
                request_nonce.clone(),
                signing_key,
            ),
            verifier: WsFrameVerifier::new(signing_session_id, request_nonce, peer_verify_key),
            _message: PhantomData,
        }
    }
}

/// Wrap a tungstenite WebSocket stream into a signed channel.
///
/// Every outgoing frame is Ed25519-signed by [`WsFrameSigner::sign_frame`].
/// Every incoming frame is verified by [`WsFrameVerifier::verify_frame`].
pub fn signed_tungstenite_websocket(
    signing_session_id: String,
    request_nonce: String,
    signing_key: SigningKey,
    peer_verify_key: VerifyingKey,
    stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
) -> SignedTungsteniteSocket {
    SignedWebSocket::new(stream, signing_session_id, request_nonce, signing_key, peer_verify_key)
}

/// Wrap an axum WebSocket into a signed channel.
///
/// Every outgoing frame is Ed25519-signed by [`WsFrameSigner::sign_frame`].
/// Every incoming frame is verified by [`WsFrameVerifier::verify_frame`].
pub fn signed_axum_websocket(
    signing_session_id: String,
    request_nonce: String,
    signing_key: SigningKey,
    peer_verify_key: VerifyingKey,
    socket: WebSocket,
) -> SignedAxumSocket {
    SignedWebSocket::new(socket, signing_session_id, request_nonce, signing_key, peer_verify_key)
}

impl<S, M, E> SignedWebSocket<S, M>
where
    S: Stream<Item = Result<M, E>> + Sink<M> + Unpin,
    <S as Sink<M>>::Error: std::error::Error + Send + Sync + 'static,
    E: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage,
{
    pub async fn send(&mut self, message: M) -> anyhow::Result<()> {
        let bytes = self.signer.sign_frame(message.decompose())?;
        let envelope_msg = M::reconstruct(RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: bytes,
        })?;
        self.ws
            .send(envelope_msg)
            .await
            .map_err(anyhow::Error::from)
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<M>> {
        loop {
            let Some(result) = self.ws.next().await else {
                return Ok(None);
            };
            let msg = result.map_err(anyhow::Error::from)?;
            let frame = msg.decompose();
            match frame.msg_type {
                RelayWsMessageType::Ping | RelayWsMessageType::Pong => continue,
                RelayWsMessageType::Close => return Ok(None),
                RelayWsMessageType::Text | RelayWsMessageType::Binary => {
                    let decoded = self.verifier.verify_frame(&frame.payload)?;
                    return Ok(Some(M::reconstruct(decoded)?));
                }
            }
        }
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        SinkExt::close(&mut self.ws)
            .await
            .map_err(anyhow::Error::from)
    }
}

impl<S, M, E> Stream for SignedWebSocket<S, M>
where
    S: Stream<Item = Result<M, E>> + Unpin,
    E: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage + Unpin,
{
    type Item = Result<M, anyhow::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        loop {
            let result = match Pin::new(&mut this.ws).poll_next(cx) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(None) => return Poll::Ready(None),
                Poll::Ready(Some(result)) => result,
            };
            let msg = match result {
                Ok(msg) => msg,
                Err(e) => return Poll::Ready(Some(Err(anyhow::Error::from(e)))),
            };
            let frame = msg.decompose();
            match frame.msg_type {
                RelayWsMessageType::Ping | RelayWsMessageType::Pong => continue,
                RelayWsMessageType::Close => return Poll::Ready(None),
                RelayWsMessageType::Text | RelayWsMessageType::Binary => {
                    let decoded = match this.verifier.verify_frame(&frame.payload) {
                        Ok(decoded) => decoded,
                        Err(e) => return Poll::Ready(Some(Err(e))),
                    };
                    return Poll::Ready(Some(M::reconstruct(decoded)));
                }
            }
        }
    }
}

impl<S, M> Sink<M> for SignedWebSocket<S, M>
where
    S: Sink<M> + Unpin,
    <S as Sink<M>>::Error: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage + Unpin,
{
    type Error = anyhow::Error;

    fn poll_ready(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Pin::new(&mut self.get_mut().ws)
            .poll_ready(cx)
            .map_err(anyhow::Error::from)
    }

    fn start_send(self: Pin<&mut Self>, item: M) -> Result<(), Self::Error> {
        let this = self.get_mut();
        let bytes = this.signer.sign_frame(item.decompose())?;
        let envelope_msg = M::reconstruct(RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: bytes,
        })?;
        Pin::new(&mut this.ws)
            .start_send(envelope_msg)
            .map_err(anyhow::Error::from)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Pin::new(&mut self.get_mut().ws)
            .poll_flush(cx)
            .map_err(anyhow::Error::from)
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Pin::new(&mut self.get_mut().ws)
            .poll_close(cx)
            .map_err(anyhow::Error::from)
    }
}
