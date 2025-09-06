use std::io;

use futures::{Stream, StreamExt};
use tokio::time::{Duration, Instant, sleep_until};

use crate::log_msg::LogMsg;

const WINDOW_MS: u64 = 10;
const WINDOW_LIMIT: usize = 10 * 1024; // 10 KiB per window

// helper that flushes buf + optional [truncated] marker
fn flush_buf(
    buf: &mut Vec<u8>,
    kind: Option<bool>,
    truncated_in_window: &mut bool,
) -> Option<LogMsg> {
    if buf.is_empty() && !*truncated_in_window {
        return None;
    }
    let mut out = String::from_utf8_lossy(buf).into_owned();
    if *truncated_in_window {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str("[truncated]\n");
    }
    buf.clear();
    *truncated_in_window = false;

    match kind {
        Some(true) => Some(LogMsg::Stdout(out)),
        Some(false) => Some(LogMsg::Stderr(out)),
        None => None,
    }
}

pub fn debounce_logs<S>(input: S) -> impl Stream<Item = Result<LogMsg, io::Error>>
where
    S: Stream<Item = Result<LogMsg, io::Error>> + Unpin,
{
    async_stream::stream! {
        let mut buf: Vec<u8> = Vec::with_capacity(WINDOW_LIMIT);
        let mut current_stream_type: Option<bool> = None; // Some(true)=stdout, Some(false)=stderr
        let mut timer = Instant::now() + Duration::from_millis(WINDOW_MS);

        // per-window accounting
        let mut window_bytes_emitted: usize = 0;
        let mut truncated_in_window: bool = false;

        tokio::pin!(input);

        loop {
            tokio::select! {
                maybe = input.next() => {
                    let msg = match maybe {
                        Some(Ok(v)) => v,
                        Some(Err(e)) => { yield Err(e); continue; }
                        None => break,
                    };

                    match &msg {
                        LogMsg::Stdout(s) | LogMsg::Stderr(s) => {
                            let is_stdout = matches!(msg, LogMsg::Stdout(_));

                            // Flush if switching stream kind
                            if current_stream_type != Some(is_stdout) {
                                if let Some(flushed) = flush_buf(&mut buf, current_stream_type, &mut truncated_in_window) {
                                    yield Ok(flushed);
                                }
                                current_stream_type = Some(is_stdout);
                                window_bytes_emitted = 0;
                                truncated_in_window = false;
                            }

                            // How many bytes can we still emit in *this* window?
                            let remaining = WINDOW_LIMIT.saturating_sub(window_bytes_emitted);

                            if remaining == 0 {
                                // We've hit the budget; drop this chunk and mark truncated
                                truncated_in_window = true;
                            } else {
                                let bytes = s.as_bytes();
                                let take = remaining.min(bytes.len());
                                buf.extend_from_slice(&bytes[..take]);
                                window_bytes_emitted += take;

                                if bytes.len() > take {
                                    // Dropped tail of this chunk
                                    truncated_in_window = true;
                                }
                            }
                        }

                        _ => {
                            // Flush accumulated stdout/stderr before passing through other messages
                            if let Some(flushed) = flush_buf(&mut buf, current_stream_type, &mut truncated_in_window) {
                                yield Ok(flushed);
                            }
                            current_stream_type = None;
                            yield Ok(msg);
                        }
                    }
                }

                _ = sleep_until(timer) => {
                    if let Some(flushed) = {
                        let kind = current_stream_type;
                        flush_buf(&mut buf, kind, &mut truncated_in_window)
                    } {
                        yield Ok(flushed);
                    }
                    // Start a fresh time window
                    timer = Instant::now() + Duration::from_millis(WINDOW_MS);
                    window_bytes_emitted = 0;
                    truncated_in_window = false;
                }
            }
        }

        // Final flush on stream end
        if let Some(flushed) = {
            let kind = current_stream_type;
            flush_buf(&mut buf, kind, &mut truncated_in_window)
        } {
            yield Ok(flushed);
        }
    }
}
