use std::{
    io,
    marker::PhantomData,
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::BytesMut;
use futures::{Sink, Stream};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

pub enum WsIoReadMessage {
    Data(Vec<u8>),
    Skip,
    Eof,
}

/// Adapts a WebSocket message stream into an AsyncRead/AsyncWrite byte stream.
pub struct WsMessageStreamIo<S, M, FRead, FWrite> {
    ws: S,
    read_buf: BytesMut,
    read_message: FRead,
    write_message: FWrite,
    _message: PhantomData<fn() -> M>,
}

impl<S, M, FRead, FWrite> WsMessageStreamIo<S, M, FRead, FWrite> {
    pub fn new(ws: S, read_message: FRead, write_message: FWrite) -> Self {
        Self {
            ws,
            read_buf: BytesMut::new(),
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
        ready!(Pin::new(&mut this.ws).poll_ready(cx))
            .map_err(|error| io::Error::other(error.to_string()))?;
        Pin::new(&mut this.ws)
            .start_send((this.write_message)(buf.to_vec()))
            .map_err(|error| io::Error::other(error.to_string()))?;

        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(Pin::new(&mut this.ws).poll_flush(cx))
            .map_err(|error| io::Error::other(error.to_string()))?;
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.as_mut().get_mut();
        ready!(Pin::new(&mut this.ws).poll_close(cx))
            .map_err(|error| io::Error::other(error.to_string()))?;
        Poll::Ready(Ok(()))
    }
}
