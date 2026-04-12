use std::{
    collections::VecDeque,
    sync::{Arc, RwLock},
};

use axum::response::sse::Event;
use futures::{StreamExt, TryStreamExt, future};
use tokio::{sync::{Notify, broadcast}, task::JoinHandle};
use tokio_stream::wrappers::BroadcastStream;

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
}

pub struct MsgStore {
    inner: RwLock<Inner>,
    sender: broadcast::Sender<LogMsg>,
    notify: Arc<Notify>,
}

impl Default for MsgStore {
    fn default() -> Self {
        Self::new()
    }
}

impl MsgStore {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(10000);
        Self {
            inner: RwLock::new(Inner {
                history: VecDeque::with_capacity(32),
                total_bytes: 0,
            }),
            sender,
            notify: Arc::new(Notify::new()),
        }
    }

    pub fn push(&self, msg: LogMsg) {
        let _ = self.sender.send(msg.clone()); // live listeners
        let bytes = msg.approx_bytes();

        let mut inner = self.inner.write().unwrap();
        while inner.total_bytes.saturating_add(bytes) > HISTORY_BYTES {
            if let Some(front) = inner.history.pop_front() {
                inner.total_bytes = inner.total_bytes.saturating_sub(front.bytes);
            } else {
                break;
            }
        }
        inner.history.push_back(StoredMsg { msg, bytes });
        inner.total_bytes = inner.total_bytes.saturating_add(bytes);
        drop(inner); // release lock before notifying
        self.notify.notify_one();
    }

    /// Returns a clone of the internal `Notify` handle.
    ///
    /// Callers can use this to be woken when new messages are pushed.
    pub fn subscribe_notify(&self) -> Arc<Notify> {
        Arc::clone(&self.notify)
    }

    // Convenience
    pub fn push_stdout<S: Into<String>>(&self, s: S) {
        self.push(LogMsg::Stdout(s.into()));
    }

    pub fn push_stderr<S: Into<String>>(&self, s: S) {
        self.push(LogMsg::Stderr(s.into()));
    }
    pub fn push_patch(&self, patch: json_patch::Patch) {
        self.push(LogMsg::JsonPatch(patch));
    }

    pub fn push_session_id(&self, session_id: String) {
        self.push(LogMsg::SessionId(session_id));
    }

    pub fn push_finished(&self) {
        self.push(LogMsg::Finished);
    }

    /// Check if the store has received a Finished message.
    pub fn is_finished(&self) -> bool {
        self.inner
            .read()
            .unwrap()
            .history
            .iter()
            .any(|s| matches!(s.msg, LogMsg::Finished))
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
        let live = BroadcastStream::new(rx)
            .filter_map(|res| async move { res.ok().map(Ok::<_, std::io::Error>) });

        Box::pin(hist.chain(live))
    }

    /// Live-only stream, skipping history.
    ///
    /// This is useful for WebSocket endpoints that want to stream only new messages
    /// without replaying the entire history. The frontend will use REST pagination
    /// to fetch historical entries separately.
    pub fn stream_live_only(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>> {
        let rx = self.get_receiver();
        let live = BroadcastStream::new(rx)
            .filter_map(|res| async move { res.ok().map(Ok::<_, std::io::Error>) });
        Box::pin(live)
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

    pub fn stderr_lines_stream(
        &self,
    ) -> futures::stream::BoxStream<'static, std::io::Result<String>> {
        self.stderr_chunked_stream().lines()
    }

    /// Same stream but mapped to `Event` for SSE handlers.
    pub fn sse_stream(&self) -> futures::stream::BoxStream<'static, Result<Event, std::io::Error>> {
        self.history_plus_stream()
            .map_ok(|m| m.to_sse_event())
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
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn test_stream_live_only_skips_history() {
        let store = Arc::new(MsgStore::new());

        // Push 5 messages to history first
        for i in 0..5 {
            store.push_stdout(format!("history_{}", i));
        }

        // Start streaming live only (should not get history)
        let mut stream = store.stream_live_only();

        // Push 3 more messages after subscribing
        for i in 0..3 {
            store.push_stdout(format!("live_{}", i));
        }
        store.push_finished();

        // Collect received messages (with timeout)
        let mut received = Vec::new();
        let timeout = tokio::time::sleep(Duration::from_millis(100));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => break,
                msg = stream.next() => {
                    match msg {
                        Some(Ok(LogMsg::Finished)) => {
                            received.push("finished".to_string());
                            break;
                        }
                        Some(Ok(LogMsg::Stdout(s))) => {
                            received.push(s);
                        }
                        _ => {}
                    }
                }
            }
        }

        // Should only receive the 3 live messages plus finished
        assert_eq!(received.len(), 4);
        assert!(
            received
                .iter()
                .all(|s| s.starts_with("live_") || s == "finished")
        );
        assert!(!received.iter().any(|s| s.starts_with("history_")));
    }

    #[tokio::test]
    async fn test_history_plus_stream_includes_history() {
        let store = Arc::new(MsgStore::new());

        // Push 3 messages to history first
        for i in 0..3 {
            store.push_stdout(format!("history_{}", i));
        }

        // Start history+live stream
        let mut stream = store.history_plus_stream();

        // Push 2 more messages after subscribing
        for i in 0..2 {
            store.push_stdout(format!("live_{}", i));
        }
        store.push_finished();

        // Collect received messages (with timeout)
        let mut received = Vec::new();
        let timeout = tokio::time::sleep(Duration::from_millis(100));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => break,
                msg = stream.next() => {
                    match msg {
                        Some(Ok(LogMsg::Finished)) => {
                            received.push("finished".to_string());
                            break;
                        }
                        Some(Ok(LogMsg::Stdout(s))) => {
                            received.push(s);
                        }
                        _ => {}
                    }
                }
            }
        }

        // Should receive 3 history + 2 live + finished = 6 total
        assert_eq!(received.len(), 6);
        // First 3 should be history messages
        assert!(received[0].starts_with("history_"));
        assert!(received[1].starts_with("history_"));
        assert!(received[2].starts_with("history_"));
    }

    #[test]
    fn test_get_history_returns_correct_messages() {
        let store = MsgStore::new();

        store.push_stdout("msg1");
        store.push_stderr("err1");
        store.push_stdout("msg2");

        let history = store.get_history();
        assert_eq!(history.len(), 3);

        matches!(&history[0], LogMsg::Stdout(s) if s == "msg1");
        matches!(&history[1], LogMsg::Stderr(s) if s == "err1");
        matches!(&history[2], LogMsg::Stdout(s) if s == "msg2");
    }
}
