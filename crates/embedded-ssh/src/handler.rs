//! SSH session handler implementing `russh::server::Handler`.
//!
//! Handles public key authentication (matched against relay signing sessions),
//! shell/exec channels over stdio, and SFTP subsystem requests.

use std::{collections::HashMap, process::Stdio};

use async_trait::async_trait;
use relay_control::signing::RelaySigningService;
use russh::{
    Channel, ChannelId, CryptoVec, Pty,
    server::{Auth, Msg, Session},
};
use russh_keys::PublicKey;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::mpsc,
};

use crate::sftp::SftpHandler;

pub struct SshSessionHandler {
    relay_signing: RelaySigningService,
    channels: HashMap<ChannelId, ChannelState>,
    tcpip_forwards: HashMap<(String, u32), tokio::task::JoinHandle<()>>,
}

enum ChannelState {
    Pending {
        channel: Channel<Msg>,
        env: HashMap<String, String>,
    },
    Active {
        writer_tx: mpsc::Sender<Vec<u8>>,
    },
}

impl SshSessionHandler {
    pub fn new(relay_signing: RelaySigningService) -> Self {
        Self {
            relay_signing,
            channels: HashMap::new(),
            tcpip_forwards: HashMap::new(),
        }
    }

    fn spawn_stdio_session(
        &mut self,
        channel_id: ChannelId,
        command: Option<&str>,
        session: &mut Session,
    ) -> Result<(), anyhow::Error> {
        tracing::debug!("Spawning stdio session (no PTY)");
        let state = self
            .channels
            .remove(&channel_id)
            .ok_or_else(|| anyhow::anyhow!("Channel not found"))?;

        let env = match state {
            ChannelState::Pending { channel: _, env } => env,
            ChannelState::Active { .. } => {
                anyhow::bail!("Channel already has an active session");
            }
        };

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let mut cmd = Command::new(shell);
        match command {
            Some(cmd_str) => {
                cmd.arg("-c");
                cmd.arg(cmd_str);
            }
            None => {
                // Non-interactive shell reading commands from stdin.
                cmd.arg("-s");
            }
        }

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.env("TERM", "xterm-256color");
        for (k, v) in env {
            cmd.env(k, v);
        }
        if let Ok(home) = std::env::var("HOME") {
            cmd.current_dir(home);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn stdio command: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to take child stdin"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to take child stdout"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to take child stderr"))?;

        let (writer_tx, mut writer_rx) = mpsc::channel::<Vec<u8>>(64);
        tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(data) = writer_rx.recv().await {
                if stdin.write_all(&data).await.is_err() {
                    break;
                }
                if stdin.flush().await.is_err() {
                    break;
                }
            }
        });

        let handle = session.handle();
        let stdout_task = tokio::spawn(async move {
            let mut stdout = stdout;
            let mut buf = vec![0u8; 8192];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = CryptoVec::from_slice(&buf[..n]);
                        if handle.data(channel_id, data).await.is_err() {
                            break;
                        }
                    }
                    Err(error) => {
                        tracing::warn!(?channel_id, ?error, "Stdio stdout read error");
                        break;
                    }
                }
            }
        });

        let handle = session.handle();
        let stderr_task = tokio::spawn(async move {
            let mut stderr = stderr;
            let mut buf = vec![0u8; 8192];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = CryptoVec::from_slice(&buf[..n]);
                        if handle.extended_data(channel_id, 1, data).await.is_err() {
                            break;
                        }
                    }
                    Err(error) => {
                        tracing::warn!(?channel_id, ?error, "Stdio stderr read error");
                        break;
                    }
                }
            }
        });

        let handle = session.handle();
        tokio::spawn(async move {
            let exit_code = match child.wait().await {
                Ok(status) => status.code().unwrap_or_default().max(0) as u32,
                Err(error) => {
                    tracing::warn!(?channel_id, ?error, "Stdio child wait failed");
                    1
                }
            };

            // Ensure both streams are fully drained before signaling EOF/close.
            let _ = stdout_task.await;
            let _ = stderr_task.await;

            let _ = handle.exit_status_request(channel_id, exit_code).await;
            let _ = handle.eof(channel_id).await;
            let _ = handle.close(channel_id).await;
        });

        self.channels
            .insert(channel_id, ChannelState::Active { writer_tx });

        let _ = session.channel_success(channel_id);
        Ok(())
    }

    fn is_loopback_target(host: &str) -> bool {
        matches!(host, "localhost" | "127.0.0.1" | "::1")
    }

    fn normalize_loopback_bind_address(address: &str) -> Option<String> {
        match address {
            "" | "localhost" | "127.0.0.1" => Some("127.0.0.1".to_string()),
            "::1" => Some("::1".to_string()),
            _ => None,
        }
    }
}

impl Drop for SshSessionHandler {
    fn drop(&mut self) {
        for (_, task) in self.tcpip_forwards.drain() {
            task.abort();
        }
    }
}

#[async_trait]
impl russh::server::Handler for SshSessionHandler {
    type Error = anyhow::Error;

    async fn auth_publickey(
        &mut self,
        _user: &str,
        public_key: &PublicKey,
    ) -> Result<Auth, Self::Error> {
        // Extract raw Ed25519 bytes from the SSH public key
        let ed25519_key = match public_key.key_data().ed25519() {
            Some(key) => key,
            None => {
                return Ok(Auth::Reject {
                    proceed_with_methods: None,
                });
            }
        };

        let key_bytes: &[u8; 32] = ed25519_key.as_ref();

        if self
            .relay_signing
            .has_active_session_with_key(key_bytes)
            .await
        {
            tracing::debug!("SSH auth accepted for Ed25519 key");
            Ok(Auth::Accept)
        } else {
            tracing::debug!("SSH auth rejected: no matching signing session");
            Ok(Auth::Reject {
                proceed_with_methods: None,
            })
        }
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        _session: &mut Session,
    ) -> Result<bool, Self::Error> {
        let id = channel.id();
        self.channels.insert(
            id,
            ChannelState::Pending {
                channel,
                env: HashMap::new(),
            },
        );
        Ok(true)
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        _col_width: u32,
        _row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        _modes: &[(Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        // PTY mode is intentionally unsupported: SSH sessions run over stdio.
        let _ = session.channel_failure(channel);
        Ok(())
    }

    async fn channel_open_direct_tcpip(
        &mut self,
        channel: Channel<Msg>,
        host_to_connect: &str,
        port_to_connect: u32,
        originator_address: &str,
        originator_port: u32,
        _session: &mut Session,
    ) -> Result<bool, Self::Error> {
        if port_to_connect == 0 || port_to_connect > u16::MAX as u32 {
            tracing::warn!(
                %host_to_connect,
                port_to_connect,
                %originator_address,
                originator_port,
                "direct-tcpip denied: invalid target port"
            );
            return Ok(false);
        }

        if !Self::is_loopback_target(host_to_connect) {
            tracing::warn!(
                %host_to_connect,
                port_to_connect,
                %originator_address,
                originator_port,
                "direct-tcpip denied: non-loopback target"
            );
            return Ok(false);
        }

        let port = port_to_connect as u16;
        let target_host = host_to_connect.to_string();
        tracing::debug!(
            %target_host,
            port,
            %originator_address,
            originator_port,
            "direct-tcpip accepted"
        );

        tokio::spawn(async move {
            let mut ssh_stream = channel.into_stream();
            match tokio::net::TcpStream::connect((target_host.as_str(), port)).await {
                Ok(mut target_stream) => {
                    if let Err(error) =
                        tokio::io::copy_bidirectional(&mut ssh_stream, &mut target_stream).await
                    {
                        tracing::debug!(%target_host, port, ?error, "direct-tcpip relay ended with error");
                    }
                }
                Err(error) => {
                    tracing::warn!(%target_host, port, ?error, "direct-tcpip connect failed");
                }
            }

            let _ = ssh_stream.shutdown().await;
        });

        Ok(true)
    }

    async fn tcpip_forward(
        &mut self,
        address: &str,
        port: &mut u32,
        session: &mut Session,
    ) -> Result<bool, Self::Error> {
        let Some(bind_addr) = Self::normalize_loopback_bind_address(address) else {
            tracing::warn!(%address, requested_port = *port, "tcpip-forward denied: non-loopback bind");
            return Ok(false);
        };

        if *port > u16::MAX as u32 {
            tracing::warn!(%bind_addr, requested_port = *port, "tcpip-forward denied: invalid bind port");
            return Ok(false);
        }

        let bind_port = *port as u16;
        let listener = match tokio::net::TcpListener::bind((bind_addr.as_str(), bind_port)).await {
            Ok(listener) => listener,
            Err(error) => {
                tracing::warn!(%bind_addr, bind_port, ?error, "tcpip-forward bind failed");
                return Ok(false);
            }
        };

        let actual_port = match listener.local_addr() {
            Ok(addr) => addr.port() as u32,
            Err(error) => {
                tracing::warn!(%bind_addr, ?error, "tcpip-forward failed to get local address");
                return Ok(false);
            }
        };
        *port = actual_port;

        let key = (bind_addr.clone(), actual_port);
        if self.tcpip_forwards.contains_key(&key) {
            tracing::warn!(%bind_addr, actual_port, "tcpip-forward denied: duplicate forward");
            return Ok(false);
        }

        let handle = session.handle();
        let bind_addr_for_task = bind_addr.clone();
        let task = tokio::spawn(async move {
            loop {
                let (mut inbound, peer_addr) = match listener.accept().await {
                    Ok(v) => v,
                    Err(error) => {
                        tracing::warn!(%bind_addr_for_task, actual_port, ?error, "tcpip-forward accept failed");
                        break;
                    }
                };

                let peer_ip = peer_addr.ip().to_string();
                let peer_port = peer_addr.port() as u32;
                let connected_addr = bind_addr_for_task.clone();
                let handle = handle.clone();
                tokio::spawn(async move {
                    let channel = match handle
                        .channel_open_forwarded_tcpip(
                            connected_addr.clone(),
                            actual_port,
                            peer_ip.clone(),
                            peer_port,
                        )
                        .await
                    {
                        Ok(channel) => channel,
                        Err(error) => {
                            tracing::warn!(
                                %connected_addr,
                                actual_port,
                                %peer_ip,
                                peer_port,
                                ?error,
                                "forwarded-tcpip channel open failed"
                            );
                            return;
                        }
                    };

                    let mut ssh_stream = channel.into_stream();
                    if let Err(error) =
                        tokio::io::copy_bidirectional(&mut ssh_stream, &mut inbound).await
                    {
                        tracing::debug!(
                            %connected_addr,
                            actual_port,
                            %peer_ip,
                            peer_port,
                            ?error,
                            "forwarded-tcpip relay ended with error"
                        );
                    }
                    let _ = ssh_stream.shutdown().await;
                    let _ = inbound.shutdown().await;
                });
            }
        });

        self.tcpip_forwards.insert(key, task);
        tracing::debug!(%bind_addr, actual_port, "tcpip-forward enabled");
        Ok(true)
    }

    async fn cancel_tcpip_forward(
        &mut self,
        address: &str,
        port: u32,
        _session: &mut Session,
    ) -> Result<bool, Self::Error> {
        let Some(bind_addr) = Self::normalize_loopback_bind_address(address) else {
            tracing::warn!(%address, port, "cancel-tcpip-forward denied: non-loopback bind");
            return Ok(false);
        };

        let key = (bind_addr.clone(), port);
        if let Some(task) = self.tcpip_forwards.remove(&key) {
            task.abort();
            tracing::debug!(%bind_addr, port, "tcpip-forward cancelled");
            Ok(true)
        } else {
            tracing::warn!(%bind_addr, port, "cancel-tcpip-forward failed: forward not found");
            Ok(false)
        }
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        tracing::debug!(?channel, "Shell request");
        self.spawn_stdio_session(channel, None, session)?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let command = std::str::from_utf8(data).unwrap_or("");
        tracing::debug!(?channel, %command, "Exec request");
        self.spawn_stdio_session(channel, Some(command), session)?;
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        if let Some(ChannelState::Active { writer_tx, .. }) = self.channels.get(&channel) {
            let _ = writer_tx.send(data.to_vec()).await;
        }
        Ok(())
    }

    async fn env_request(
        &mut self,
        _channel: ChannelId,
        variable_name: &str,
        variable_value: &str,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        if let Some(ChannelState::Pending { env, .. }) = self.channels.get_mut(&_channel) {
            env.insert(variable_name.to_string(), variable_value.to_string());
        }
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel_id: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        if name == "sftp" {
            tracing::debug!(?channel_id, "SFTP subsystem request");

            if let Some(ChannelState::Pending { channel, .. }) = self.channels.remove(&channel_id) {
                let _ = session.channel_success(channel_id);
                let sftp_handler = SftpHandler::default();
                tokio::spawn(async move {
                    let stream = channel.into_stream();
                    russh_sftp::server::run(stream, sftp_handler).await;
                });
            } else {
                let _ = session.channel_failure(channel_id);
            }
        } else {
            let _ = session.channel_failure(channel_id);
        }
        Ok(())
    }

    async fn channel_close(
        &mut self,
        channel: ChannelId,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channels.remove(&channel);
        Ok(())
    }

    async fn channel_eof(
        &mut self,
        channel: ChannelId,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        // Drop the writer to signal EOF to the PTY
        if let Some(ChannelState::Active { writer_tx, .. }) = self.channels.get_mut(&channel) {
            // Dropping the sender will cause the writer task to exit
            let (replacement_tx, _) = mpsc::channel(1);
            let _ = std::mem::replace(writer_tx, replacement_tx);
        }
        Ok(())
    }
}
