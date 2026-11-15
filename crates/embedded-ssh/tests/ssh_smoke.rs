//! End-to-end smoke tests for the embedded SSH server against a real russh
//! 0.61 client over a loopback TCP socket.
//!
//! These exercise the runtime paths that only `cargo build`/`clippy` can't
//! catch after the russh 0.48 -> 0.61 upgrade:
//!   * Ed25519 host-key construction (`russh::keys::PrivateKey::new` with the
//!     `ssh-key 0.7` `KeypairData` types).
//!   * Public-key auth (`auth_publickey` + `Auth::Reject { partial_success }`).
//!   * stdio exec channel (`Handle::data` taking `impl Into<Bytes>`).
//!   * SFTP subsystem (`SftpError -> StatusReply`) used by VS Code Remote.

use std::{sync::Arc, time::Duration};

use ed25519_dalek::SigningKey;
use embedded_ssh::{config::build_config, run_ssh_session};
use relay_control::signing::RelaySigningService;
use russh::{ChannelMsg, client, keys::PrivateKeyWithHashAlg};
use russh_sftp::{client::SftpSession, protocol::OpenFlags};
use ssh_key::private::{Ed25519Keypair, Ed25519PrivateKey, KeypairData};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

/// Build a russh client private key from a raw Ed25519 signing key, mirroring
/// how the server derives its host key in `config::build_config`.
fn client_private_key(signing_key: &SigningKey) -> russh::keys::PrivateKey {
    let ed25519_private = Ed25519PrivateKey::from_bytes(&signing_key.to_bytes());
    let keypair = Ed25519Keypair::from(ed25519_private);
    russh::keys::PrivateKey::new(KeypairData::Ed25519(keypair), "").expect("valid Ed25519 key")
}

struct TestClient;

impl client::Handler for TestClient {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Loopback test server; accept any host key.
        Ok(true)
    }
}

/// Spin up the embedded SSH server on a loopback socket with one authorized
/// client key, returning the bound address and a connected, authenticated
/// client session.
async fn connect_authenticated() -> (SigningKey, client::Handle<TestClient>) {
    // Server host identity (any Ed25519 key works).
    let host_signing = SigningKey::from_bytes(&[7u8; 32]);
    // Client identity that we will authorize on the server.
    let client_signing = SigningKey::from_bytes(&[42u8; 32]);

    let relay_signing = RelaySigningService::new(SigningKey::from_bytes(&[1u8; 32]));
    // Authorize the client's public key by registering an active signing session.
    relay_signing
        .create_session(client_signing.verifying_key())
        .await;

    let config = build_config(&host_signing);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback");
    let addr = listener.local_addr().expect("local addr");

    // Accept exactly one connection and drive an SSH session over it.
    let server_relay = relay_signing.clone();
    tokio::spawn(async move {
        let (stream, _peer) = listener.accept().await.expect("accept");
        let _ = run_ssh_session(stream, config, server_relay).await;
    });

    let client_config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(10)),
        ..Default::default()
    });
    let mut session = client::connect(client_config, addr, TestClient)
        .await
        .expect("client connect");

    let key = client_private_key(&client_signing);
    let auth = session
        .authenticate_publickey("workspace", PrivateKeyWithHashAlg::new(Arc::new(key), None))
        .await
        .expect("auth call");
    assert!(auth.success(), "public-key authentication should succeed");

    (client_signing, session)
}

#[tokio::test]
async fn exec_channel_roundtrips_stdout() {
    let (_client_signing, session) = connect_authenticated().await;

    let mut channel = session.channel_open_session().await.expect("open channel");
    channel
        .exec(true, "printf 'hello-ssh'")
        .await
        .expect("exec");

    let mut stdout = Vec::new();
    let mut exit_code = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { ref data } => stdout.extend_from_slice(data),
            ChannelMsg::ExitStatus { exit_status } => exit_code = Some(exit_status),
            ChannelMsg::Eof | ChannelMsg::Close => {}
            _ => {}
        }
    }

    assert_eq!(exit_code, Some(0), "command should exit cleanly");
    assert_eq!(
        String::from_utf8_lossy(&stdout),
        "hello-ssh",
        "stdout should round-trip through the stdio exec channel"
    );
}

#[tokio::test]
async fn rejects_unauthorized_public_key() {
    // Server with NO authorized client sessions.
    let host_signing = SigningKey::from_bytes(&[9u8; 32]);
    let relay_signing = RelaySigningService::new(SigningKey::from_bytes(&[2u8; 32]));
    let config = build_config(&host_signing);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback");
    let addr = listener.local_addr().expect("local addr");

    let server_relay = relay_signing.clone();
    tokio::spawn(async move {
        if let Ok((stream, _)) = listener.accept().await {
            let _ = run_ssh_session(stream, config, server_relay).await;
        }
    });

    let client_config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(10)),
        ..Default::default()
    });
    let mut session = client::connect(client_config, addr, TestClient)
        .await
        .expect("client connect");

    let unauthorized = SigningKey::from_bytes(&[123u8; 32]);
    let key = client_private_key(&unauthorized);
    let auth = session
        .authenticate_publickey("workspace", PrivateKeyWithHashAlg::new(Arc::new(key), None))
        .await
        .expect("auth call");

    assert!(
        !auth.success(),
        "auth must be rejected when no signing session matches the key"
    );
}

#[tokio::test]
async fn sftp_subsystem_round_trips_a_file() {
    let (_client_signing, session) = connect_authenticated().await;

    let channel = session.channel_open_session().await.expect("open channel");
    channel
        .request_subsystem(true, "sftp")
        .await
        .expect("request sftp subsystem");
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .expect("start sftp session");

    let dir = std::env::temp_dir();
    let path = dir
        .join(format!("vibe_sftp_smoke_{}.txt", std::process::id()))
        .to_string_lossy()
        .into_owned();

    let payload = b"sftp-roundtrip-via-russh-0.61";

    let mut file = sftp
        .open_with_flags(
            &path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE | OpenFlags::READ,
        )
        .await
        .expect("open file over sftp");
    file.write_all(payload).await.expect("write over sftp");
    file.flush().await.expect("flush over sftp");

    file.rewind().await.expect("rewind");
    let mut readback = Vec::new();
    file.read_to_end(&mut readback).await.expect("read back");
    assert_eq!(readback, payload, "sftp file contents should round-trip");

    file.shutdown().await.expect("close file");
    sftp.remove_file(&path).await.expect("cleanup sftp file");
}
