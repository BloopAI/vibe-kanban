use std::time::Duration;

use tokio_yamux::Config as YamuxConfig;

pub mod client;
pub mod server;
pub mod tls;

/// Shared yamux configuration for both client and server sides of the relay tunnel.
///
/// Increases the stream window size and write timeout over the defaults (256 KB / 10s)
/// to handle large HTTP responses over slow connections without triggering write timeouts.
pub(crate) fn yamux_config() -> YamuxConfig {
    YamuxConfig {
        max_stream_window_size: 1024 * 1024, // 1 MB (default: 256 KB)
        connection_write_timeout: Duration::from_secs(30), // (default: 10s)
        ..Default::default()
    }
}

/// Convert an HTTP(S) URL to its WebSocket equivalent (ws:// or wss://).
pub fn http_to_ws_url(http_url: &str) -> anyhow::Result<String> {
    if let Some(rest) = http_url.strip_prefix("https://") {
        Ok(format!("wss://{rest}"))
    } else if let Some(rest) = http_url.strip_prefix("http://") {
        Ok(format!("ws://{rest}"))
    } else {
        anyhow::bail!("unsupported URL scheme: {http_url}")
    }
}
