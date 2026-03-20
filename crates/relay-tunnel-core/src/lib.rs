pub mod client;
pub mod server;
pub mod tls;
pub mod ws_io;

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
