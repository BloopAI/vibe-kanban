//! WebSocket utilities for server-side keep-alive and heartbeat.

use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::time::{Instant, MissedTickBehavior, interval};

/// Configuration for WebSocket keep-alive behavior.
#[derive(Debug, Clone)]
pub struct WsKeepAlive {
    /// Interval between server-initiated ping frames.
    pub ping_interval: Duration,
    /// Maximum time to wait for pong response before considering connection dead.
    pub pong_timeout: Duration,
}

impl Default for WsKeepAlive {
    fn default() -> Self {
        Self {
            ping_interval: Duration::from_secs(30),
            pong_timeout: Duration::from_secs(90),
        }
    }
}

impl WsKeepAlive {
    /// Create keep-alive config for long-lived list/status streams.
    pub fn for_list_streams() -> Self {
        Self {
            ping_interval: Duration::from_secs(30),
            pong_timeout: Duration::from_secs(90),
        }
    }

    /// Create keep-alive config for active execution streams.
    pub fn for_execution_streams() -> Self {
        Self {
            ping_interval: Duration::from_secs(15),
            pong_timeout: Duration::from_secs(60),
        }
    }
}

/// Run a WebSocket stream handler with keep-alive support.
///
/// This function handles:
/// - Server-initiated ping frames at regular intervals
/// - Pong timeout detection to close dead connections
/// - Client ping response
/// - Clean shutdown on stream end or client disconnect
///
/// # Arguments
/// * `socket` - The WebSocket connection
/// * `data_stream` - A stream of messages to forward to the client
/// * `keep_alive` - Configuration for ping/pong behavior
pub async fn run_ws_stream<S, E>(
    socket: WebSocket,
    mut data_stream: S,
    keep_alive: WsKeepAlive,
) -> anyhow::Result<()>
where
    S: futures_util::Stream<Item = Result<Message, E>> + Unpin,
    E: std::fmt::Display + Send + Sync + 'static,
{
    let (mut sender, mut receiver) = socket.split();

    let mut ping_interval = interval(keep_alive.ping_interval);
    ping_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let mut last_pong = Instant::now();

    loop {
        tokio::select! {
            // Forward data from stream to WebSocket
            item = data_stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if sender.send(msg).await.is_err() {
                            tracing::debug!("client disconnected during send");
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("stream error: {}", e);
                        break;
                    }
                    None => {
                        tracing::debug!("data stream ended");
                        break;
                    }
                }
            }

            // Handle incoming WebSocket messages (ping/pong/close)
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Pong(_))) => {
                        last_pong = Instant::now();
                    }
                    Some(Ok(Message::Ping(data))) => {
                        // Respond to client-initiated pings
                        if sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        tracing::debug!("client sent close frame");
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::debug!(?e, "websocket receive error");
                        break;
                    }
                    None => {
                        tracing::debug!("websocket stream ended");
                        break;
                    }
                    _ => {} // Ignore text/binary from client
                }
            }

            // Send ping and check pong timeout
            _ = ping_interval.tick() => {
                // Check if pong timeout exceeded
                if last_pong.elapsed() > keep_alive.pong_timeout {
                    tracing::warn!(
                        elapsed_secs = last_pong.elapsed().as_secs(),
                        "WebSocket pong timeout, closing connection"
                    );
                    break;
                }

                // Send ping frame
                if sender.send(Message::Ping(Vec::new().into())).await.is_err() {
                    tracing::debug!("failed to send ping, client disconnected");
                    break;
                }
            }
        }
    }

    // Attempt graceful close
    let _ = sender.send(Message::Close(None)).await;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keep_alive_defaults() {
        let ka = WsKeepAlive::default();
        assert_eq!(ka.ping_interval, Duration::from_secs(30));
        assert_eq!(ka.pong_timeout, Duration::from_secs(90));
    }

    #[test]
    fn test_keep_alive_for_list_streams() {
        let ka = WsKeepAlive::for_list_streams();
        assert_eq!(ka.ping_interval, Duration::from_secs(30));
        assert_eq!(ka.pong_timeout, Duration::from_secs(90));
    }

    #[test]
    fn test_keep_alive_for_execution_streams() {
        let ka = WsKeepAlive::for_execution_streams();
        assert_eq!(ka.ping_interval, Duration::from_secs(15));
        assert_eq!(ka.pong_timeout, Duration::from_secs(60));
    }
}
