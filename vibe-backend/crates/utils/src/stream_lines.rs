use bytes::Bytes;
use futures::{Stream, StreamExt, TryStreamExt};
use tokio_util::{
    codec::{FramedRead, LinesCodec},
    io::StreamReader,
};

/// Extension trait for converting chunked string streams to line streams.
pub trait LinesStreamExt: Stream<Item = Result<String, std::io::Error>> + Sized {
    /// Convert a chunked string stream to a line stream.
    fn lines(self) -> futures::stream::BoxStream<'static, std::io::Result<String>>
    where
        Self: Send + 'static,
    {
        let reader = StreamReader::new(self.map(|result| result.map(Bytes::from)));
        FramedRead::new(reader, LinesCodec::new())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
            .boxed()
    }
}

impl<S> LinesStreamExt for S where S: Stream<Item = Result<String, std::io::Error>> {}
