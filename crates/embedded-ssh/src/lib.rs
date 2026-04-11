pub mod config;
pub mod handler;
pub mod sftp;

use std::sync::Arc;

use relay_control::signing::RelaySigningService;
use tokio::io::{AsyncRead, AsyncWrite};

/// Run an SSH server session over the given stream.
///
/// The stream is typically an axum WebSocket wrapped in `AxumWsStreamIo`.
/// Authentication checks the connecting client's Ed25519 public key against
/// active relay signing sessions.
pub async fn run_ssh_session(
    stream: impl AsyncRead + AsyncWrite + Unpin + Send + 'static,
    config: Arc<russh::server::Config>,
    relay_signing: RelaySigningService,
) -> anyhow::Result<()> {
    let handler = handler::SshSessionHandler::new(relay_signing);
    let session = russh::server::run_stream(config, stream, handler).await?;
    session.await?;
    Ok(())
}
