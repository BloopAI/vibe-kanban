use std::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::{
    Sink, Stream, StreamExt,
    stream::{SplitSink, SplitStream},
};
use relay_ws_crypto::{InboundRelayVerifier, OutboundRelaySigner, RelaySessionCrypto};
use relay_ws_protocol::RelayMessage;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio_tungstenite::tungstenite;

use crate::RelayWsStream;

pub struct RelayTunnel {
    writer: TunnelWriter,
    reader: TunnelReader,
    read_buf: Vec<u8>,
    flushing: bool,
}

impl Unpin for RelayTunnel {}

impl RelayTunnel {
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
            writer: TunnelWriter::new(OutboundRelaySigner::new(&session), sink),
            reader: TunnelReader::new(InboundRelayVerifier::new(&session), stream),
            read_buf: Vec::new(),
            flushing: false,
        }
    }
}

impl AsyncRead for RelayTunnel {
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

impl AsyncWrite for RelayTunnel {
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

struct TunnelWriter {
    sink: SplitSink<RelayWsStream, tungstenite::Message>,
    signer: OutboundRelaySigner,
}

impl TunnelWriter {
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

    fn start_send_chunk(&mut self, chunk: &[u8]) -> anyhow::Result<()> {
        let envelope_bytes = self
            .signer
            .sign_message_bytes(RelayMessage::Binary(chunk.to_vec()))?;
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
}

struct TunnelReader {
    stream: SplitStream<RelayWsStream>,
    verifier: InboundRelayVerifier,
}

impl TunnelReader {
    fn new(verifier: InboundRelayVerifier, stream: SplitStream<RelayWsStream>) -> Self {
        Self { stream, verifier }
    }

    fn poll_recv_chunk(&mut self, cx: &mut Context<'_>) -> Poll<anyhow::Result<Option<Vec<u8>>>> {
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

            match relay_message {
                RelayMessage::Binary(payload) => return Poll::Ready(Ok(Some(payload))),
                RelayMessage::Text(text) => return Poll::Ready(Ok(Some(text.into_bytes()))),
                RelayMessage::Ping(_) | RelayMessage::Pong(_) => continue,
                RelayMessage::Close(_) => return Poll::Ready(Ok(None)),
            }
        }
    }
}
