use http_body_util::Empty;
use hyper::{Method, Request, client::conn::http1 as client_http1, upgrade};
use hyper_util::rt::TokioIo;
use tokio::sync::Mutex;
use tokio_yamux::Control;

/// Opens a TCP tunnel over a new yamux stream using HTTP CONNECT.
///
/// Sends `CONNECT ssh-tunnel HTTP/1.1` over the stream, waits for a 200
/// response, then upgrades the connection and returns the raw bidirectional
/// stream for the caller to bridge to a WebSocket or other transport.
pub async fn open_tcp_tunnel(control: &Mutex<Control>) -> anyhow::Result<hyper::upgrade::Upgraded> {
    let stream = {
        let mut control = control.lock().await;
        control
            .open_stream()
            .await
            .map_err(|e| anyhow::anyhow!("failed to open yamux stream for TCP tunnel: {e}"))?
    };

    let (mut sender, connection) = client_http1::Builder::new()
        .handshake(TokioIo::new(stream))
        .await
        .map_err(|e| anyhow::anyhow!("TCP tunnel HTTP handshake failed: {e}"))?;

    tokio::spawn(async move {
        if let Err(error) = connection.with_upgrades().await {
            tracing::debug!(?error, "TCP tunnel connection closed");
        }
    });

    let request = Request::builder()
        .method(Method::CONNECT)
        .uri("ssh-tunnel")
        .body(Empty::<bytes::Bytes>::new())
        .map_err(|e| anyhow::anyhow!("failed to build CONNECT request: {e}"))?;

    let mut response = sender
        .send_request(request)
        .await
        .map_err(|e| anyhow::anyhow!("TCP tunnel CONNECT request failed: {e}"))?;

    if !response.status().is_success() {
        anyhow::bail!(
            "TCP tunnel CONNECT rejected with status {}",
            response.status()
        );
    }

    let upgraded = upgrade::on(&mut response)
        .await
        .map_err(|e| anyhow::anyhow!("TCP tunnel upgrade failed: {e}"))?;

    Ok(upgraded)
}
