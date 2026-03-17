//! Generic signed WebSocket channel.
//!
//! [`SignedWebSocket`] wraps a bidirectional WS stream, delegating frame
//! signing to [`WsFrameSigner`] and verification to [`WsFrameVerifier`].

use std::{
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll},
};

use axum::extract::ws::{Message as AxumMessage, WebSocket};
use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::{
    Sink, SinkExt, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite};

use crate::{
    crypto::{RelayWsFrame, RelayWsMessageType, WsFrameSigner, WsFrameVerifier},
    protocol::RelayTransportMessage,
};

pub type SignedTungsteniteSocket =
    SignedWebSocket<WebSocketStream<MaybeTlsStream<TcpStream>>, tungstenite::Message>;
pub type SignedAxumSocket = SignedWebSocket<WebSocket, AxumMessage>;

// ---------------------------------------------------------------------------
// SignedWebSocket
// ---------------------------------------------------------------------------

pub struct SignedWebSocket<S, M> {
    sender: SignedWsSender<SplitSink<S, M>, M>,
    receiver: SignedWsReceiver<SplitStream<S>, M>,
}

impl<S, M> SignedWebSocket<S, M> {
    /// Split into the underlying sender and receiver for concurrent use.
    #[allow(clippy::type_complexity)]
    pub fn split(
        self,
    ) -> (
        SignedWsSender<SplitSink<S, M>, M>,
        SignedWsReceiver<SplitStream<S>, M>,
    ) {
        (self.sender, self.receiver)
    }
}

/// Wrap a tungstenite WebSocket stream into a signed channel.
///
/// Every outgoing frame is Ed25519-signed by [`WsFrameSigner::encode`].
/// Every incoming frame is verified by [`WsFrameVerifier::decode`].
pub fn signed_tungstenite_websocket(
    signing_session_id: String,
    request_nonce: String,
    signing_key: SigningKey,
    peer_verify_key: VerifyingKey,
    stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
) -> SignedTungsteniteSocket {
    let (sink, stream) = stream.split();
    let sender = SignedWsSender::new(
        WsFrameSigner::new(
            signing_session_id.clone(),
            request_nonce.clone(),
            signing_key,
        ),
        sink,
    );
    let receiver = SignedWsReceiver::new(
        WsFrameVerifier::new(signing_session_id, request_nonce, peer_verify_key),
        stream,
    );
    SignedWebSocket { sender, receiver }
}

/// Wrap an axum WebSocket into a signed channel.
///
/// Every outgoing frame is Ed25519-signed by [`WsFrameSigner::encode`].
/// Every incoming frame is verified by [`WsFrameVerifier::decode`].
pub fn signed_axum_websocket(
    signing_session_id: String,
    request_nonce: String,
    signing_key: SigningKey,
    peer_verify_key: VerifyingKey,
    socket: WebSocket,
) -> SignedAxumSocket {
    let (sink, stream) = socket.split();
    let sender = SignedWsSender::new(
        WsFrameSigner::new(
            signing_session_id.clone(),
            request_nonce.clone(),
            signing_key,
        ),
        sink,
    );
    let receiver = SignedWsReceiver::new(
        WsFrameVerifier::new(signing_session_id, request_nonce, peer_verify_key),
        stream,
    );
    SignedWebSocket { sender, receiver }
}

impl<S, M, E> SignedWebSocket<S, M>
where
    SplitSink<S, M>: Sink<M> + Unpin,
    <SplitSink<S, M> as Sink<M>>::Error: std::error::Error + Send + Sync + 'static,
    SplitStream<S>: Stream<Item = Result<M, E>> + Unpin,
    E: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage,
{
    pub async fn send(&mut self, message: M) -> anyhow::Result<()> {
        self.sender.send(message.decompose()).await
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<M>> {
        match self.receiver.recv().await? {
            Some(frame) => Ok(Some(M::reconstruct(frame)?)),
            None => Ok(None),
        }
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        self.sender.close().await
    }
}

impl<S, M, E> Stream for SignedWebSocket<S, M>
where
    SplitStream<S>: Stream<Item = Result<M, E>> + Unpin,
    SplitSink<S, M>: Unpin,
    E: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage + Unpin,
{
    type Item = Result<M, anyhow::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        loop {
            let result = match Pin::new(&mut this.receiver.stream).poll_next(cx) {
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
                    let decoded = match this.receiver.verifier.decode(&frame.payload) {
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
    SplitSink<S, M>: Sink<M> + Unpin,
    <SplitSink<S, M> as Sink<M>>::Error: std::error::Error + Send + Sync + 'static,
    SplitStream<S>: Unpin,
    M: RelayTransportMessage + Unpin,
{
    type Error = anyhow::Error;

    fn poll_ready(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Pin::new(&mut self.get_mut().sender.sink)
            .poll_ready(cx)
            .map_err(anyhow::Error::from)
    }

    fn start_send(self: Pin<&mut Self>, item: M) -> Result<(), Self::Error> {
        let this = self.get_mut();
        let bytes = this.sender.signer.encode(item.decompose())?;
        let envelope_msg = M::reconstruct(RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: bytes,
        })?;
        Pin::new(&mut this.sender.sink)
            .start_send(envelope_msg)
            .map_err(anyhow::Error::from)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Pin::new(&mut self.get_mut().sender.sink)
            .poll_flush(cx)
            .map_err(anyhow::Error::from)
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Pin::new(&mut self.get_mut().sender.sink)
            .poll_close(cx)
            .map_err(anyhow::Error::from)
    }
}

// ---------------------------------------------------------------------------
// SignedWsSender / SignedWsReceiver — thin transport wrappers
// ---------------------------------------------------------------------------

pub struct SignedWsSender<Si, M> {
    sink: Si,
    signer: WsFrameSigner,
    _message: PhantomData<M>,
}

pub struct SignedWsReceiver<St, M> {
    stream: St,
    verifier: WsFrameVerifier,
    _message: PhantomData<M>,
}

impl<Si, M> SignedWsSender<Si, M> {
    fn new(signer: WsFrameSigner, sink: Si) -> Self {
        Self {
            sink,
            signer,
            _message: PhantomData,
        }
    }
}

impl<Si, M> SignedWsSender<Si, M>
where
    Si: Sink<M> + Unpin,
    Si::Error: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage,
{
    pub async fn send(&mut self, frame: RelayWsFrame) -> anyhow::Result<()> {
        let bytes = self.signer.encode(frame)?;
        let envelope_msg = M::reconstruct(RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: bytes,
        })?;
        self.sink
            .send(envelope_msg)
            .await
            .map_err(anyhow::Error::from)
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        self.sink.close().await.map_err(anyhow::Error::from)
    }
}

impl<St, M> SignedWsReceiver<St, M> {
    fn new(verifier: WsFrameVerifier, stream: St) -> Self {
        Self {
            stream,
            verifier,
            _message: PhantomData,
        }
    }
}

impl<St, M, E> SignedWsReceiver<St, M>
where
    St: Stream<Item = Result<M, E>> + Unpin,
    E: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage,
{
    pub async fn recv(&mut self) -> anyhow::Result<Option<RelayWsFrame>> {
        loop {
            let Some(result) = self.stream.next().await else {
                return Ok(None);
            };
            let msg = result.map_err(anyhow::Error::from)?;
            let frame = msg.decompose();
            match frame.msg_type {
                RelayWsMessageType::Ping | RelayWsMessageType::Pong => continue,
                RelayWsMessageType::Close => return Ok(None),
                RelayWsMessageType::Text | RelayWsMessageType::Binary => {
                    return Ok(Some(self.verifier.decode(&frame.payload)?));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use futures_channel::mpsc;
    use futures_util::StreamExt;

    use super::*;

    fn test_channel() -> (
        mpsc::UnboundedSender<TestMessage>,
        mpsc::UnboundedReceiver<TestMessage>,
    ) {
        mpsc::unbounded()
    }

    #[derive(Debug, Clone)]
    struct TestMessage(Vec<u8>);

    impl RelayTransportMessage for TestMessage {
        fn decompose(self) -> RelayWsFrame {
            RelayWsFrame {
                msg_type: RelayWsMessageType::Binary,
                payload: self.0,
            }
        }
        fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self> {
            Ok(TestMessage(frame.payload))
        }
    }

    #[tokio::test]
    async fn roundtrip_send_recv() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();

        let (tx, rx) = test_channel();

        let mut sender = SignedWsSender::<_, TestMessage>::new(
            WsFrameSigner::new("session-1".into(), "nonce-1".into(), signing_key),
            tx,
        );
        let mut receiver = SignedWsReceiver::<_, TestMessage>::new(
            WsFrameVerifier::new("session-1".into(), "nonce-1".into(), verify_key),
            rx.map(Ok::<_, mpsc::SendError>),
        );

        sender
            .send(RelayWsFrame {
                msg_type: RelayWsMessageType::Text,
                payload: b"hello".to_vec(),
            })
            .await
            .expect("send");

        let decoded = receiver.recv().await.expect("recv").expect("some frame");
        assert!(matches!(decoded.msg_type, RelayWsMessageType::Text));
        assert_eq!(decoded.payload, b"hello");
    }

    #[test]
    fn decode_rejects_out_of_order_sequence() {
        let signing_key = SigningKey::generate(&mut rand::thread_rng());
        let verify_key = signing_key.verifying_key();

        let mut signer = WsFrameSigner::new("session-1".into(), "nonce-1".into(), signing_key);
        let mut verifier = WsFrameVerifier::new("session-1".into(), "nonce-1".into(), verify_key);

        let frame1 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"first".to_vec(),
        };
        let frame2 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"second".to_vec(),
        };
        let encoded1 = signer.encode(frame1).expect("encode first");
        let encoded2 = signer.encode(frame2).expect("encode second");

        let result = verifier.decode(&encoded2);
        assert!(result.is_err());

        verifier.decode(&encoded1).expect("decode first");
        verifier.decode(&encoded2).expect("decode second");
    }
}
