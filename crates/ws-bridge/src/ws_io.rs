use std::{
    io,
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll, ready},
};

use axum::extract::ws::{Message as AxumWsMessage, WebSocket as AxumWebSocket};
use bytes::BytesMut;
use futures::{Sink, Stream};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio_tungstenite::tungstenite;

pub enum WsIoReadMessage {
    Data(Vec<u8>),
    Skip,
    Eof,
}

/// Adapts a WebSocket message stream into an AsyncRead/AsyncWrite byte stream.
pub struct WsMessageStreamIo<S, M, FRead, FWrite> {
    ws: S,
    read_buf: BytesMut,
    /// When true, a previous start_send completed but flush is still pending.
    flushing: bool,
    read_message: FRead,
    write_message: FWrite,
    _message: PhantomData<fn() -> M>,
}

impl<S, M, FRead, FWrite> WsMessageStreamIo<S, M, FRead, FWrite> {
    pub fn new(ws: S, read_message: FRead, write_message: FWrite) -> Self {
        Self {
            ws,
            read_buf: BytesMut::new(),
            flushing: false,
            read_message,
            write_message,
            _message: PhantomData,
        }
    }
}

impl<S, M, E, FRead, FWrite> AsyncRead for WsMessageStreamIo<S, M, FRead, FWrite>
where
    S: Stream<Item = Result<M, E>> + Unpin,
    E: std::fmt::Display,
    FRead: Fn(M) -> WsIoReadMessage + Unpin,
    FWrite: Fn(Vec<u8>) -> M + Unpin,
{
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        loop {
            let this = self.as_mut().get_mut();

            if !this.read_buf.is_empty() {
                let n = buf.remaining().min(this.read_buf.len());
                buf.put_slice(&this.read_buf.split_to(n));
                return Poll::Ready(Ok(()));
            }

            let message = match ready!(Pin::new(&mut this.ws).poll_next(cx)) {
                Some(Ok(message)) => message,
                Some(Err(error)) => return Poll::Ready(Err(io::Error::other(error.to_string()))),
                None => return Poll::Ready(Ok(())),
            };

            match (this.read_message)(message) {
                WsIoReadMessage::Data(data) => this.read_buf.extend_from_slice(&data),
                WsIoReadMessage::Skip => continue,
                WsIoReadMessage::Eof => return Poll::Ready(Ok(())),
            }
        }
    }
}

impl<S, M, E, FRead, FWrite> AsyncWrite for WsMessageStreamIo<S, M, FRead, FWrite>
where
    S: Sink<M, Error = E> + Unpin,
    E: std::fmt::Display,
    FRead: Fn(M) -> WsIoReadMessage + Unpin,
    FWrite: Fn(Vec<u8>) -> M + Unpin,
{
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        if buf.is_empty() {
            return Poll::Ready(Ok(0));
        }

        let this = self.as_mut().get_mut();
        if !this.flushing {
            ready!(Pin::new(&mut this.ws).poll_ready(cx))
                .map_err(|error| io::Error::other(error.to_string()))?;
            Pin::new(&mut this.ws)
                .start_send((this.write_message)(buf.to_vec()))
                .map_err(|error| io::Error::other(error.to_string()))?;
            this.flushing = true;
        }

        ready!(Pin::new(&mut this.ws).poll_flush(cx))
            .map_err(|error| io::Error::other(error.to_string()))?;
        this.flushing = false;

        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(Pin::new(&mut this.ws).poll_flush(cx))
            .map_err(|error| io::Error::other(error.to_string()))?;
        this.flushing = false;
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(Pin::new(&mut this.ws).poll_close(cx))
            .map_err(|error| io::Error::other(error.to_string()))?;
        this.flushing = false;
        Poll::Ready(Ok(()))
    }
}

pub type AxumWsStreamIo<S = AxumWebSocket> = WsMessageStreamIo<
    S,
    AxumWsMessage,
    fn(AxumWsMessage) -> WsIoReadMessage,
    fn(Vec<u8>) -> AxumWsMessage,
>;

pub fn axum_ws_stream_io<S>(ws: S) -> AxumWsStreamIo<S> {
    WsMessageStreamIo::new(ws, read_axum_message, write_axum_message)
}

fn read_axum_message(message: AxumWsMessage) -> WsIoReadMessage {
    match message {
        AxumWsMessage::Binary(data) => WsIoReadMessage::Data(data.to_vec()),
        AxumWsMessage::Text(text) => WsIoReadMessage::Data(text.as_bytes().to_vec()),
        AxumWsMessage::Close(_) => WsIoReadMessage::Eof,
        _ => WsIoReadMessage::Skip,
    }
}

fn write_axum_message(bytes: Vec<u8>) -> AxumWsMessage {
    AxumWsMessage::Binary(bytes.into())
}

pub type TungsteniteWsStreamIo<S> = WsMessageStreamIo<
    S,
    tungstenite::Message,
    fn(tungstenite::Message) -> WsIoReadMessage,
    fn(Vec<u8>) -> tungstenite::Message,
>;

pub fn tungstenite_ws_stream_io<S>(ws: S) -> TungsteniteWsStreamIo<S> {
    WsMessageStreamIo::new(ws, read_tungstenite_message, write_tungstenite_message)
}

fn read_tungstenite_message(message: tungstenite::Message) -> WsIoReadMessage {
    match message {
        tungstenite::Message::Binary(data) => WsIoReadMessage::Data(data.to_vec()),
        tungstenite::Message::Text(text) => WsIoReadMessage::Data(text.as_bytes().to_vec()),
        tungstenite::Message::Close(_) => WsIoReadMessage::Eof,
        _ => WsIoReadMessage::Skip,
    }
}

fn write_tungstenite_message(bytes: Vec<u8>) -> tungstenite::Message {
    tungstenite::Message::Binary(bytes.into())
}

/// Convert an axum WS message to a tungstenite WS message, preserving
/// the message type (text, binary, ping, pong, close).
pub fn axum_to_tungstenite(msg: AxumWsMessage) -> tungstenite::Message {
    match msg {
        AxumWsMessage::Text(text) => tungstenite::Message::Text(text.to_string().into()),
        AxumWsMessage::Binary(bytes) => tungstenite::Message::Binary(bytes.to_vec().into()),
        AxumWsMessage::Ping(bytes) => tungstenite::Message::Ping(bytes.to_vec().into()),
        AxumWsMessage::Pong(bytes) => tungstenite::Message::Pong(bytes.to_vec().into()),
        AxumWsMessage::Close(frame) => {
            tungstenite::Message::Close(frame.map(|cf| tungstenite::protocol::CloseFrame {
                code: tungstenite::protocol::frame::coding::CloseCode::from(cf.code),
                reason: cf.reason.to_string().into(),
            }))
        }
    }
}

/// Convert a tungstenite WS message to an axum WS message, preserving
/// the message type (text, binary, ping, pong, close).
pub fn tungstenite_to_axum(msg: tungstenite::Message) -> AxumWsMessage {
    match msg {
        tungstenite::Message::Text(text) => AxumWsMessage::Text(text.to_string().into()),
        tungstenite::Message::Binary(bytes) => AxumWsMessage::Binary(bytes.to_vec().into()),
        tungstenite::Message::Ping(bytes) => AxumWsMessage::Ping(bytes.to_vec().into()),
        tungstenite::Message::Pong(bytes) => AxumWsMessage::Pong(bytes.to_vec().into()),
        tungstenite::Message::Close(frame) => {
            AxumWsMessage::Close(frame.map(|cf| axum::extract::ws::CloseFrame {
                code: cf.code.into(),
                reason: cf.reason.to_string().into(),
            }))
        }
        tungstenite::Message::Frame(_) => AxumWsMessage::Binary(vec![].into()),
    }
}
