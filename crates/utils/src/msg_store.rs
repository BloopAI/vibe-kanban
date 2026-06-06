use std::{
    collections::VecDeque,
    sync::{Arc, RwLock},
};

use futures::{StreamExt, future};
use tokio::{sync::broadcast, task::JoinHandle};
use tokio_stream::wrappers::{BroadcastStream, errors::BroadcastStreamRecvError};

use crate::{log_msg::LogMsg, stream_lines::LinesStreamExt};

// 100 MB Limit
const HISTORY_BYTES: usize = 100000 * 1024;

#[derive(Clone)]
struct StoredMsg {
    msg: LogMsg,
    bytes: usize,
}

struct Inner {
    history: VecDeque<StoredMsg>,
    total_bytes: usize,
    max_history_bytes: usize,
}

pub struct MsgStore {
    inner: RwLock<Inner>,
    sender: broadcast::Sender<LogMsg>,
}

impl Default for MsgStore {
    fn default() -> Self {
        Self::new()
    }
}

impl MsgStore {
    pub fn new() -> Self {
        Self::new_with_history_bytes(HISTORY_BYTES)
    }

    pub fn new_with_history_bytes(max_history_bytes: usize) -> Self {
        let (sender, _) = broadcast::channel(100000);
        Self {
            inner: RwLock::new(Inner {
                history: VecDeque::with_capacity(32),
                total_bytes: 0,
                max_history_bytes,
            }),
            sender,
        }
    }

    pub fn push(&self, msg: LogMsg) {
        let _ = self.sender.send(msg.clone()); // live listeners
        let bytes = msg.approx_bytes();

        let mut inner = self.inner.write().unwrap();
        if bytes > inner.max_history_bytes {
            return;
        }
        while inner.total_bytes.saturating_add(bytes) > inner.max_history_bytes {
            if let Some(front) = inner.history.pop_front() {
                inner.total_bytes = inner.total_bytes.saturating_sub(front.bytes);
            } else {
                break;
            }
        }
        inner.history.push_back(StoredMsg { msg, bytes });
        inner.total_bytes = inner.total_bytes.saturating_add(bytes);
    }

    // Convenience
    pub fn push_stdout<S: Into<String>>(&self, s: S) {
        self.push(LogMsg::Stdout(s.into()));
    }

    pub fn push_patch(&self, patch: json_patch::Patch) {
        self.push(LogMsg::JsonPatch(patch));
    }

    pub fn push_session_id(&self, session_id: String) {
        self.push(LogMsg::SessionId(session_id));
    }

    pub fn push_message_id(&self, id: String) {
        self.push(LogMsg::MessageId(id));
    }

    pub fn push_finished(&self) {
        self.push(LogMsg::Finished);
    }

    pub fn get_receiver(&self) -> broadcast::Receiver<LogMsg> {
        self.sender.subscribe()
    }

    pub fn get_history(&self) -> Vec<LogMsg> {
        self.inner
            .read()
            .unwrap()
            .history
            .iter()
            .map(|s| s.msg.clone())
            .collect()
    }

    /// History then live, as `LogMsg`.
    pub fn history_plus_stream(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>> {
        let (history, rx) = (self.get_history(), self.get_receiver());

        let hist = futures::stream::iter(history.into_iter().map(Ok::<_, std::io::Error>));
        let live = BroadcastStream::new(rx).filter_map(|res| async move {
            match res {
                Ok(msg) => Some(Ok(msg)),
                Err(BroadcastStreamRecvError::Lagged(n)) => {
                    tracing::error!(
                        skipped = n,
                        "MsgStore broadcast lagged. {n} messages dropped for this subscriber"
                    );
                    None
                }
            }
        });

        Box::pin(hist.chain(live))
    }

    pub fn stdout_chunked_stream(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<String, std::io::Error>> {
        self.history_plus_stream()
            .take_while(|res| future::ready(!matches!(res, Ok(LogMsg::Finished))))
            .filter_map(|res| async move {
                match res {
                    Ok(LogMsg::Stdout(s)) => Some(Ok(s)),
                    _ => None,
                }
            })
            .boxed()
    }

    pub fn stdout_lines_stream(
        &self,
    ) -> futures::stream::BoxStream<'static, std::io::Result<String>> {
        self.stdout_chunked_stream().lines()
    }

    pub fn stderr_chunked_stream(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<String, std::io::Error>> {
        self.history_plus_stream()
            .take_while(|res| future::ready(!matches!(res, Ok(LogMsg::Finished))))
            .filter_map(|res| async move {
                match res {
                    Ok(LogMsg::Stderr(s)) => Some(Ok(s)),
                    _ => None,
                }
            })
            .boxed()
    }

    /// Forward a stream of typed log messages into this store.
    pub fn spawn_forwarder<S, E>(self: Arc<Self>, stream: S) -> JoinHandle<()>
    where
        S: futures::Stream<Item = Result<LogMsg, E>> + Send + 'static,
        E: std::fmt::Display + Send + 'static,
    {
        tokio::spawn(async move {
            tokio::pin!(stream);

            while let Some(next) = stream.next().await {
                match next {
                    Ok(msg) => self.push(msg),
                    Err(e) => self.push(LogMsg::Stderr(format!("stream error: {e}"))),
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_history_keeps_recent_messages_under_limit() {
        let store = MsgStore::new_with_history_bytes(64);

        store.push_stdout("first");
        store.push_stdout("second");
        store.push_stdout("third");

        let history = store.get_history();
        assert!(!history.is_empty());
        assert!(history.iter().map(LogMsg::approx_bytes).sum::<usize>() <= 64);
        assert!(matches!(history.last(), Some(LogMsg::Stdout(s)) if s == "third"));
    }

    #[test]
    fn oversized_message_is_broadcast_but_not_retained() {
        let store = MsgStore::new_with_history_bytes(16);
        let mut receiver = store.get_receiver();

        store.push_stdout("this message is too large for history");

        assert!(store.get_history().is_empty());
        assert!(matches!(
            receiver.try_recv(),
            Ok(LogMsg::Stdout(s)) if s == "this message is too large for history"
        ));
    }
}
