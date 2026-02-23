use std::convert::Infallible;

use axum::body::Body;
use http::StatusCode;
use hyper::{Request, Response, body::Incoming, upgrade};
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;

use super::TcpForwardConfig;

/// Handles an HTTP CONNECT request by tunneling to the configured SSH target.
///
/// Responds with 200, upgrades the connection, then copies bytes bidirectionally
/// between the upgraded stream and a TCP connection to the forward target.
pub async fn handle_connect_tunnel(
    mut request: Request<Incoming>,
    config: &TcpForwardConfig,
) -> Result<Response<Body>, Infallible> {
    let target_addr = &config.ssh_target_addr;

    let request_upgrade = upgrade::on(&mut request);

    // Respond 200 to indicate the tunnel is established.
    let response = Response::builder()
        .status(StatusCode::OK)
        .body(Body::empty())
        .unwrap_or_else(|_| Response::new(Body::empty()));

    let target_addr = target_addr.clone();
    tokio::spawn(async move {
        let Ok(upgraded) = request_upgrade.await else {
            tracing::warn!("TCP tunnel upgrade failed");
            return;
        };

        let mut tcp_stream = match TcpStream::connect(&target_addr).await {
            Ok(stream) => stream,
            Err(error) => {
                tracing::warn!(?error, %target_addr, "failed to connect to SSH target");
                return;
            }
        };

        let mut upgraded = TokioIo::new(upgraded);

        if let Err(error) =
            tokio::io::copy_bidirectional(&mut upgraded, &mut tcp_stream).await
        {
            tracing::debug!(?error, "TCP tunnel copy ended");
        }
    });

    Ok(response)
}

pub fn simple_forbidden() -> Response<Body> {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .body(Body::from("TCP tunneling not enabled"))
        .unwrap_or_else(|_| Response::new(Body::from("TCP tunneling not enabled")))
}
