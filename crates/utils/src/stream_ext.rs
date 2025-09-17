use std::io;

use futures::{Stream, StreamExt};
use tokio::time::{Duration, Instant, sleep_until};

use crate::log_msg::LogMsg;

const WINDOW_MS: u64 = 10;
const WINDOW_LIMIT: usize = 100 * 1024; // 100 KiB per window
// To avoid unbounded growth within a window, cap accumulation.
// We allow collecting more than WINDOW_LIMIT to preserve both head and tail,
// then apply middle truncation on flush.
const COLLECT_LIMIT: usize = WINDOW_LIMIT * 2;

const TRUNC_MARKER: &str = " [truncated] ";

fn middle_truncate_bytes(bytes: &[u8], limit: usize, marker: &str) -> String {
    if bytes.len() <= limit {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let m = marker.as_bytes();
    let mlen = m.len();
    if limit <= mlen {
        // Degenerate case: not enough room; return a cut marker
        return String::from_utf8_lossy(&m[..limit]).into_owned();
    }
    let keep_prefix = (limit - mlen) / 2;
    let keep_suffix = limit - mlen - keep_prefix;

    let mut out = Vec::with_capacity(limit);
    out.extend_from_slice(&bytes[..keep_prefix]);
    out.extend_from_slice(m);
    out.extend_from_slice(&bytes[bytes.len() - keep_suffix..]);
    String::from_utf8_lossy(&out).into_owned()
}

fn shrink_middle(buf: &mut Vec<u8>, target_len: usize) {
    if buf.len() <= target_len {
        return;
    }
    let extra = buf.len() - target_len;
    let mid = buf.len() / 2;
    let start = mid.saturating_sub(extra / 2);
    let end = start + extra;
    buf.drain(start..end);
}

// Helper that flushes buffer, inserting a middle [truncated] marker when needed
fn flush_buf(
    buf: &mut Vec<u8>,
    kind: Option<bool>,
    truncated_in_window: &mut bool,
) -> Option<LogMsg> {
    if buf.is_empty() && !*truncated_in_window {
        return None;
    }

    let needs_marker = *truncated_in_window || buf.len() > WINDOW_LIMIT;
    let out = if needs_marker {
        middle_truncate_bytes(buf, WINDOW_LIMIT, TRUNC_MARKER)
    } else {
        String::from_utf8_lossy(buf).into_owned()
    };

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
        // Single accumulation buffer per window; we trim from the middle when exceeding COLLECT_LIMIT
        let mut buf: Vec<u8> = Vec::with_capacity(WINDOW_LIMIT);
        let mut current_stream_type: Option<bool> = None; // Some(true)=stdout, Some(false)=stderr
        let mut timer = Instant::now() + Duration::from_millis(WINDOW_MS);

        // per-window accounting
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
                                buf.clear();
                                truncated_in_window = false;
                            }

                            let bytes = s.as_bytes();
                            buf.extend_from_slice(bytes);
                            if buf.len() > COLLECT_LIMIT {
                                truncated_in_window = true;
                                shrink_middle(&mut buf, COLLECT_LIMIT);
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
                    buf.clear();
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
