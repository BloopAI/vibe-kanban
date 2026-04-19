use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use russh::client::{self, Handle, Handler};
use russh_keys::ssh_key::{HashAlg, PublicKey};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::Mutex as TokioMutex,
};

use crate::error::SshTunnelError;

pub struct SshConfig {
    pub ssh_host: String,
    pub ssh_port: u16,
    pub ssh_user: String,
    pub key_path: String,
    pub remote_host: String,
    pub remote_port: u16,
    /// If `Some`, the captured host key fingerprint is checked against this value.
    /// If `None`, the first connection is accepted unconditionally (TOFU).
    pub expected_fingerprint: Option<String>,
}

/// Captures the server's host key fingerprint and optionally verifies it.
///
/// On a first (TOFU) connection `expected` is `None` and any key is accepted.
/// On subsequent connections `expected` holds the stored fingerprint and any
/// mismatch causes the connection to be refused.
struct CapturingKeyVerifier {
    fingerprint: Arc<Mutex<Option<String>>>,
    expected: Option<String>,
}

#[async_trait]
impl Handler for CapturingKeyVerifier {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let fp = format!("{}", server_public_key.fingerprint(HashAlg::Sha256));
        *self.fingerprint.lock().unwrap() = Some(fp.clone());

        if let Some(expected) = &self.expected {
            if &fp != expected {
                tracing::warn!(
                    got = %fp,
                    expected = %expected,
                    "SSH host key fingerprint mismatch — rejecting connection"
                );
                return Ok(false);
            }
        }
        Ok(true)
    }
}

pub struct SshTunnel {
    pub local_port: u16,
    /// The SHA-256 fingerprint of the server's host key, captured during handshake.
    pub captured_fingerprint: Option<String>,
    _task: tokio::task::JoinHandle<()>,
}

impl SshTunnel {
    pub async fn start(config: SshConfig) -> Result<Self, SshTunnelError> {
        let key_pair =
            russh_keys::load_secret_key(&config.key_path, None).map_err(SshTunnelError::Key)?;
        let key_pair = Arc::new(key_pair);

        let fingerprint_cell: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

        let handler = CapturingKeyVerifier {
            fingerprint: Arc::clone(&fingerprint_cell),
            expected: config.expected_fingerprint.clone(),
        };

        let ssh_config = Arc::new(client::Config::default());
        let mut handle: Handle<CapturingKeyVerifier> = client::connect(
            ssh_config,
            (config.ssh_host.as_str(), config.ssh_port),
            handler,
        )
        .await?;

        let authenticated = handle
            .authenticate_publickey(&config.ssh_user, key_pair)
            .await?;
        if !authenticated {
            return Err(SshTunnelError::AuthFailed);
        }

        let captured_fingerprint = fingerprint_cell.lock().unwrap().clone();

        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let local_port = listener.local_addr()?.port();

        let remote_host = config.remote_host.clone();
        let remote_port = config.remote_port;

        // Wrap handle in Arc<TokioMutex> so it can be shared across spawned connection tasks.
        // The mutex is only held during channel open, not during data transfer.
        let shared_handle = Arc::new(TokioMutex::new(handle));

        let task = tokio::spawn(async move {
            loop {
                let Ok((stream, peer)) = listener.accept().await else {
                    break;
                };
                tracing::debug!("SSH tunnel: new local connection from {peer}");

                let handle_clone = Arc::clone(&shared_handle);
                let rh = remote_host.clone();
                let rp = remote_port;

                tokio::spawn(async move {
                    if let Err(e) = forward_connection(stream, handle_clone, &rh, rp).await {
                        tracing::warn!("SSH tunnel forward error: {e}");
                    }
                });
            }
        });

        Ok(Self {
            local_port,
            captured_fingerprint,
            _task: task,
        })
    }
}

async fn forward_connection(
    mut local: TcpStream,
    handle: Arc<TokioMutex<Handle<CapturingKeyVerifier>>>,
    remote_host: &str,
    remote_port: u16,
) -> Result<(), SshTunnelError> {
    let local_addr = local.local_addr()?;

    // Open the SSH direct-tcpip channel. Lock is released once we have the Channel.
    let channel = {
        let guard = handle.lock().await;
        guard
            .channel_open_direct_tcpip(
                remote_host,
                remote_port as u32,
                local_addr.ip().to_string(),
                local_addr.port() as u32,
            )
            .await
            .map_err(|_| SshTunnelError::ChannelOpenFailed)?
    };

    let mut ssh_stream = channel.into_stream();
    tokio::io::copy_bidirectional(&mut local, &mut ssh_stream).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_config_fields() {
        let cfg = SshConfig {
            ssh_host: "localhost".to_string(),
            ssh_port: 22,
            ssh_user: "test".to_string(),
            key_path: "/tmp/fake_key".to_string(),
            remote_host: "127.0.0.1".to_string(),
            remote_port: 8081,
            expected_fingerprint: None,
        };
        assert_eq!(cfg.ssh_port, 22);
        assert_eq!(cfg.remote_port, 8081);
        assert_eq!(cfg.ssh_host, "localhost");
        assert_eq!(cfg.remote_host, "127.0.0.1");
        assert!(cfg.expected_fingerprint.is_none());
    }

    #[test]
    fn ssh_config_with_expected_fingerprint() {
        let fp = "SHA256:abcdefghij1234567890".to_string();
        let cfg = SshConfig {
            ssh_host: "host.example.com".to_string(),
            ssh_port: 22,
            ssh_user: "root".to_string(),
            key_path: "/tmp/key".to_string(),
            remote_host: "127.0.0.1".to_string(),
            remote_port: 8081,
            expected_fingerprint: Some(fp.clone()),
        };
        assert_eq!(cfg.expected_fingerprint.unwrap(), fp);
    }
}
