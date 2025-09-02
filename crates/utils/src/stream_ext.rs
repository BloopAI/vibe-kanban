use std::io;

use futures::{Stream, StreamExt};
use tokio::time::{Duration, Instant, sleep_until};

use crate::log_msg::LogMsg;

const WINDOW_MS: u64 = 200;
const WINDOW_LIMIT: usize = 10 * 1024; // 10 KiB per window

pub fn debounce_logs<S>(input: S) -> impl Stream<Item = Result<LogMsg, io::Error>>
where
    S: Stream<Item = Result<LogMsg, io::Error>> + Unpin,
{
    async_stream::stream! {
        let mut buf: Vec<u8> = Vec::with_capacity(WINDOW_LIMIT);
        let mut current_stream_type: Option<bool> = None; // None, Some(true) = stdout, Some(false) = stderr
        let mut timer = Instant::now() + Duration::from_millis(WINDOW_MS);

        tokio::pin!(input);

        loop {
            tokio::select! {
                // incoming chunks
                maybe = input.next() => {
                    let msg = match maybe {
                        Some(Ok(v)) => v,
                        Some(Err(e)) => {
                            yield Err(e);
                            continue;
                        }
                        None => break,                 // EOF
                    };

                    // We only limit Stdout / Stderr.
                    match &msg {
                        LogMsg::Stdout(s) => {
                            // Flush buffer if switching stream types
                            if let Some(false) = current_stream_type
                                && !buf.is_empty() {
                                    yield Ok(LogMsg::Stderr(String::from_utf8_lossy(&buf).into_owned()));
                                    buf.clear();
                                }
                            current_stream_type = Some(true);

                            // Check if this chunk would overflow the window
                            if buf.len() + s.len() > WINDOW_LIMIT {
                                // Flush existing buffer if not empty
                                if !buf.is_empty() {
                                    yield Ok(LogMsg::Stdout(String::from_utf8_lossy(&buf).into_owned()));
                                    buf.clear();
                                }

                                // If single chunk is huge, truncate it
                                if s.len() > WINDOW_LIMIT {
                                    let truncated = String::from_utf8_lossy(&s.as_bytes()[..WINDOW_LIMIT]);
                                    yield Ok(LogMsg::Stdout(truncated.into_owned()));
                                    yield Ok(LogMsg::Stdout("[truncated]\n".into()));
                                } else {
                                    yield Ok(LogMsg::Stdout(s.clone()));
                                }

                                timer = Instant::now() + Duration::from_millis(WINDOW_MS);
                                continue;
                            }
                            buf.extend_from_slice(s.as_bytes());
                        }
                        LogMsg::Stderr(s) => {
                            // Flush buffer if switching stream types
                            if let Some(true) = current_stream_type
                                && !buf.is_empty() {
                                    yield Ok(LogMsg::Stdout(String::from_utf8_lossy(&buf).into_owned()));
                                    buf.clear();
                                }
                            current_stream_type = Some(false);

                            // Check if this chunk would overflow the window
                            if buf.len() + s.len() > WINDOW_LIMIT {
                                // Flush existing buffer if not empty
                                if !buf.is_empty() {
                                    yield Ok(LogMsg::Stderr(String::from_utf8_lossy(&buf).into_owned()));
                                    buf.clear();
                                }

                                // If single chunk is huge, truncate it
                                if s.len() > WINDOW_LIMIT {
                                    let truncated = String::from_utf8_lossy(&s.as_bytes()[..WINDOW_LIMIT]);
                                    yield Ok(LogMsg::Stderr(truncated.into_owned()));
                                    yield Ok(LogMsg::Stderr("[truncated]\n".into()));
                                } else {
                                    yield Ok(LogMsg::Stderr(s.clone()));
                                }

                                timer = Instant::now() + Duration::from_millis(WINDOW_MS);
                                continue;
                            }
                            buf.extend_from_slice(s.as_bytes());
                        }
                        _ => {                          // JsonPatch, SessionId, Finished
                            // Flush any accumulated buffer before passing through other messages
                            if !buf.is_empty() {
                                match current_stream_type {
                                    Some(true) => yield Ok(LogMsg::Stdout(String::from_utf8_lossy(&buf).into_owned())),
                                    Some(false) => yield Ok(LogMsg::Stderr(String::from_utf8_lossy(&buf).into_owned())),
                                    None => {}
                                }
                                buf.clear();
                                current_stream_type = None;
                            }
                            yield Ok(msg);                   // pass through unchanged
                        }
                    }
                }

                // end of window
                _ = sleep_until(timer) => {
                    if !buf.is_empty() {
                        match current_stream_type {
                            Some(true) => yield Ok(LogMsg::Stdout(String::from_utf8_lossy(&buf).into_owned())),
                            Some(false) => yield Ok(LogMsg::Stderr(String::from_utf8_lossy(&buf).into_owned())),
                            None => {}
                        }
                        buf.clear();
                        current_stream_type = None;
                    }
                    timer = Instant::now() + Duration::from_millis(WINDOW_MS);
                }
            }
        }

        // flush leftovers on stream end
        if !buf.is_empty() {
            match current_stream_type {
                Some(true) => yield Ok(LogMsg::Stdout(String::from_utf8_lossy(&buf).into_owned())),
                Some(false) => yield Ok(LogMsg::Stderr(String::from_utf8_lossy(&buf).into_owned())),
                None => {}
            }
        }
    }
}
