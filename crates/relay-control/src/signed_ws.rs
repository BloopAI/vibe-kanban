use std::{
    fmt::Display,
    future::Future,
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll},
};

use anyhow::Context as _;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use futures_util::{
    Sink, SinkExt, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// RelayTransportMessage — unifies axum and tungstenite WS messages
// ---------------------------------------------------------------------------

pub trait RelayTransportMessage: Sized {
    /// Decompose into a [`RelayWsFrame`] preserving the original message type.
    fn decompose(self) -> RelayWsFrame;
    /// Reconstruct a native WS message from a [`RelayWsFrame`].
    fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self>;
}

#[cfg(feature = "axum")]
mod axum_impl {
    use axum::extract::ws::{CloseFrame, Message};

    use super::*;

    impl RelayTransportMessage for Message {
        fn decompose(self) -> RelayWsFrame {
            let (msg_type, payload) = match self {
                Self::Text(text) => (RelayWsMessageType::Text, text.as_str().as_bytes().to_vec()),
                Self::Binary(payload) => (RelayWsMessageType::Binary, payload.to_vec()),
                Self::Ping(payload) => (RelayWsMessageType::Ping, payload.to_vec()),
                Self::Pong(payload) => (RelayWsMessageType::Pong, payload.to_vec()),
                Self::Close(close_frame) => {
                    (RelayWsMessageType::Close, encode_axum_close(close_frame))
                }
            };
            RelayWsFrame { msg_type, payload }
        }

        fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self> {
            match frame.msg_type {
                RelayWsMessageType::Text => {
                    let text =
                        String::from_utf8(frame.payload).context("invalid UTF-8 text frame")?;
                    Ok(Self::Text(text.into()))
                }
                RelayWsMessageType::Binary => Ok(Self::Binary(frame.payload.into())),
                RelayWsMessageType::Ping => Ok(Self::Ping(frame.payload.into())),
                RelayWsMessageType::Pong => Ok(Self::Pong(frame.payload.into())),
                RelayWsMessageType::Close => Ok(Self::Close(decode_axum_close(frame.payload)?)),
            }
        }
    }

    fn encode_axum_close(close_frame: Option<CloseFrame>) -> Vec<u8> {
        if let Some(close_frame) = close_frame {
            let code: u16 = close_frame.code;
            let reason = close_frame.reason.to_string();
            let mut payload = Vec::with_capacity(2 + reason.len());
            payload.extend_from_slice(&code.to_be_bytes());
            payload.extend_from_slice(reason.as_bytes());
            payload
        } else {
            Vec::new()
        }
    }

    fn decode_axum_close(payload: Vec<u8>) -> anyhow::Result<Option<CloseFrame>> {
        if payload.is_empty() {
            return Ok(None);
        }

        if payload.len() < 2 {
            return Err(anyhow::anyhow!("invalid close payload"));
        }

        let code = u16::from_be_bytes([payload[0], payload[1]]);
        let reason =
            String::from_utf8(payload[2..].to_vec()).context("invalid UTF-8 close frame reason")?;

        Ok(Some(CloseFrame {
            code,
            reason: reason.into(),
        }))
    }
}

#[cfg(feature = "tungstenite")]
mod tungstenite_impl {
    use tokio_tungstenite::tungstenite;

    use super::*;

    impl RelayTransportMessage for tungstenite::Message {
        fn decompose(self) -> RelayWsFrame {
            let (msg_type, payload) = match self {
                Self::Text(text) => (RelayWsMessageType::Text, text.to_string().into_bytes()),
                Self::Binary(data) => (RelayWsMessageType::Binary, data.to_vec()),
                Self::Ping(data) => (RelayWsMessageType::Ping, data.to_vec()),
                Self::Pong(data) => (RelayWsMessageType::Pong, data.to_vec()),
                Self::Close(frame) => {
                    let payload = if let Some(f) = frame {
                        let code: u16 = f.code.into();
                        let mut p = Vec::with_capacity(2 + f.reason.len());
                        p.extend_from_slice(&code.to_be_bytes());
                        p.extend_from_slice(f.reason.as_bytes());
                        p
                    } else {
                        Vec::new()
                    };
                    (RelayWsMessageType::Close, payload)
                }
                _ => (RelayWsMessageType::Binary, Vec::new()),
            };
            RelayWsFrame { msg_type, payload }
        }

        fn reconstruct(frame: RelayWsFrame) -> anyhow::Result<Self> {
            match frame.msg_type {
                RelayWsMessageType::Text => {
                    let text =
                        String::from_utf8(frame.payload).context("invalid UTF-8 text frame")?;
                    Ok(Self::Text(text.into()))
                }
                RelayWsMessageType::Binary => Ok(Self::Binary(frame.payload.into())),
                RelayWsMessageType::Ping => Ok(Self::Ping(frame.payload.into())),
                RelayWsMessageType::Pong => Ok(Self::Pong(frame.payload.into())),
                RelayWsMessageType::Close => {
                    if frame.payload.is_empty() {
                        return Ok(Self::Close(None));
                    }
                    if frame.payload.len() < 2 {
                        anyhow::bail!("invalid close payload");
                    }
                    let code = u16::from_be_bytes([frame.payload[0], frame.payload[1]]);
                    let reason = String::from_utf8(frame.payload[2..].to_vec())
                        .context("invalid UTF-8 close frame reason")?;
                    Ok(Self::Close(Some(tungstenite::protocol::CloseFrame {
                        code: code.into(),
                        reason: reason.into(),
                    })))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public types — the relay WS signing contract
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RelayWsMessageType {
    Text,
    Binary,
    Ping,
    Pong,
    Close,
}

#[derive(Debug)]
pub struct RelayWsFrame {
    pub msg_type: RelayWsMessageType,
    pub payload: Vec<u8>,
}

// ---------------------------------------------------------------------------
// UpstreamWs — abstract send/recv/close over RelayWsFrame
// ---------------------------------------------------------------------------

/// Sender half of a WS upstream (relay, WebRTC, etc.).
pub trait UpstreamWsSender: Send + 'static {
    fn send(
        &mut self,
        frame: RelayWsFrame,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>>;

    fn close(&mut self) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>>;
}

/// Receiver half of a WS upstream (relay, WebRTC, etc.).
pub trait UpstreamWsReceiver: Send + 'static {
    fn recv(
        &mut self,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<RelayWsFrame>>> + Send + '_>>;
}

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

/// Wrap a bidirectional WebSocket stream into a signed channel.
pub fn signed_websocket<S, M>(
    signing_session_id: String,
    request_nonce: String,
    signing_key: SigningKey,
    peer_verify_key: VerifyingKey,
    stream: S,
) -> SignedWebSocket<S, M>
where
    S: Stream + Sink<M> + Sized,
{
    let (sink, stream) = stream.split();
    let sender = SignedWsSender::new(
        signing_session_id.clone(),
        request_nonce.clone(),
        signing_key,
        sink,
    );
    let receiver =
        SignedWsReceiver::new(signing_session_id, request_nonce, peer_verify_key, stream);
    SignedWebSocket { sender, receiver }
}

impl<S, M> SignedWebSocket<S, M>
where
    SignedWsSender<SplitSink<S, M>, M>: UpstreamWsSender,
    SignedWsReceiver<SplitStream<S>, M>: UpstreamWsReceiver,
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
                    let decoded = match this.receiver.decode(&frame.payload) {
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
        let bytes = this.sender.encode(item.decompose())?;
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

pub struct SignedWsSender<Si, M> {
    sink: Si,
    signing_session_id: String,
    request_nonce: String,
    outbound_seq: u64,
    signing_key: SigningKey,
    _message: PhantomData<M>,
}

pub struct SignedWsReceiver<St, M> {
    stream: St,
    signing_session_id: String,
    request_nonce: String,
    inbound_seq: u64,
    peer_verify_key: VerifyingKey,
    _message: PhantomData<M>,
}

// ---------------------------------------------------------------------------
// SignedWsSender / SignedWsReceiver
// ---------------------------------------------------------------------------

impl<Si, M> SignedWsSender<Si, M> {
    pub fn new(
        signing_session_id: String,
        request_nonce: String,
        signing_key: SigningKey,
        sink: Si,
    ) -> Self {
        Self {
            sink,
            signing_session_id,
            request_nonce,
            outbound_seq: 0,
            signing_key,
            _message: PhantomData,
        }
    }

    fn encode(&mut self, frame: RelayWsFrame) -> anyhow::Result<Vec<u8>> {
        self.outbound_seq = self.outbound_seq.saturating_add(1);
        let signing_input = ws_signing_input(
            &self.signing_session_id,
            &self.request_nonce,
            self.outbound_seq,
            frame.msg_type,
            &frame.payload,
        );
        let signature_b64 =
            BASE64_STANDARD.encode(self.signing_key.sign(signing_input.as_bytes()).to_bytes());
        let envelope = SignedWsEnvelope {
            version: ENVELOPE_VERSION,
            seq: self.outbound_seq,
            msg_type: frame.msg_type,
            payload_b64: BASE64_STANDARD.encode(frame.payload),
            signature_b64,
        };
        serde_json::to_vec(&envelope).map_err(anyhow::Error::from)
    }
}

impl<Si, M> UpstreamWsSender for SignedWsSender<Si, M>
where
    Si: Sink<M> + Unpin + Send + 'static,
    Si::Error: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage + Send + 'static,
{
    fn send(
        &mut self,
        frame: RelayWsFrame,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>> {
        Box::pin(async move {
            let bytes = self.encode(frame)?;
            let envelope_msg = M::reconstruct(RelayWsFrame {
                msg_type: RelayWsMessageType::Binary,
                payload: bytes,
            })?;
            self.sink
                .send(envelope_msg)
                .await
                .map_err(anyhow::Error::from)
        })
    }

    fn close(&mut self) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + '_>> {
        Box::pin(async move { self.sink.close().await.map_err(anyhow::Error::from) })
    }
}

impl<St, M, E> UpstreamWsReceiver for SignedWsReceiver<St, M>
where
    St: Stream<Item = Result<M, E>> + Unpin + Send + 'static,
    E: std::error::Error + Send + Sync + 'static,
    M: RelayTransportMessage + Send + 'static,
{
    fn recv(
        &mut self,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<RelayWsFrame>>> + Send + '_>> {
        Box::pin(async move {
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
                        return Ok(Some(self.decode(&frame.payload)?));
                    }
                }
            }
        })
    }
}

impl<St, M> SignedWsReceiver<St, M> {
    pub fn new(
        signing_session_id: String,
        request_nonce: String,
        peer_verify_key: VerifyingKey,
        stream: St,
    ) -> Self {
        Self {
            stream,
            signing_session_id,
            request_nonce,
            inbound_seq: 0,
            peer_verify_key,
            _message: PhantomData,
        }
    }

    fn decode(&mut self, raw: &[u8]) -> anyhow::Result<RelayWsFrame> {
        let envelope: SignedWsEnvelope =
            serde_json::from_slice(raw).context("invalid relay WS envelope JSON")?;

        if envelope.version != ENVELOPE_VERSION {
            anyhow::bail!("unsupported relay WS envelope version");
        }

        let expected_seq = self.inbound_seq.saturating_add(1);
        if envelope.seq != expected_seq {
            anyhow::bail!(
                "invalid relay WS sequence: expected {expected_seq}, got {}",
                envelope.seq
            );
        }

        let payload = BASE64_STANDARD
            .decode(&envelope.payload_b64)
            .context("invalid relay WS payload")?;

        let signing_input = ws_signing_input(
            &self.signing_session_id,
            &self.request_nonce,
            envelope.seq,
            envelope.msg_type,
            &payload,
        );
        let signature_bytes = BASE64_STANDARD
            .decode(&envelope.signature_b64)
            .context("invalid relay WS frame signature encoding")?;
        let signature =
            Signature::from_slice(&signature_bytes).context("invalid relay WS frame signature")?;
        self.peer_verify_key
            .verify(signing_input.as_bytes(), &signature)
            .context("invalid relay WS frame signature")?;

        self.inbound_seq = envelope.seq;
        Ok(RelayWsFrame {
            msg_type: envelope.msg_type,
            payload,
        })
    }
}

// ---------------------------------------------------------------------------
// Private internals
// ---------------------------------------------------------------------------

const ENVELOPE_VERSION: u8 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct SignedWsEnvelope {
    version: u8,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload_b64: String,
    signature_b64: String,
}

impl RelayWsMessageType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Binary => "binary",
            Self::Ping => "ping",
            Self::Pong => "pong",
            Self::Close => "close",
        }
    }
}

fn ws_signing_input(
    signing_session_id: impl Display,
    request_nonce: &str,
    seq: u64,
    msg_type: RelayWsMessageType,
    payload: &[u8],
) -> String {
    let payload_hash = BASE64_STANDARD.encode(Sha256::digest(payload));
    format!(
        "v1|{signing_session_id}|{request_nonce}|{seq}|{msg_type}|{payload_hash}",
        msg_type = msg_type.as_str()
    )
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

    /// Minimal message type for testing without axum/tungstenite features.
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
            "session-1".into(),
            "nonce-1".into(),
            signing_key,
            tx,
        );
        let mut receiver = SignedWsReceiver::<_, TestMessage>::new(
            "session-1".into(),
            "nonce-1".into(),
            verify_key,
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

        let (tx, _rx) = test_channel();
        let mut sender = SignedWsSender::<_, TestMessage>::new(
            "session-1".into(),
            "nonce-1".into(),
            signing_key,
            tx,
        );

        let stream = futures_util::stream::empty::<Result<TestMessage, mpsc::SendError>>();
        let mut receiver = SignedWsReceiver::<_, TestMessage>::new(
            "session-1".into(),
            "nonce-1".into(),
            verify_key,
            stream,
        );

        let frame1 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"first".to_vec(),
        };
        let frame2 = RelayWsFrame {
            msg_type: RelayWsMessageType::Binary,
            payload: b"second".to_vec(),
        };
        let encoded1 = sender.encode(frame1).expect("encode first");
        let encoded2 = sender.encode(frame2).expect("encode second");

        // Skip first, try to decode second — should fail
        let result = receiver.decode(&encoded2);
        assert!(result.is_err());

        // Decode in order should work
        receiver.decode(&encoded1).expect("decode first");
        receiver.decode(&encoded2).expect("decode second");
    }
}
