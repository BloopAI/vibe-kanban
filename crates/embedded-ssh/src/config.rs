use std::{sync::Arc, time::Duration};

use ed25519_dalek::SigningKey;
use russh::server::Config;
use ssh_key::private::{Ed25519Keypair, Ed25519PrivateKey, KeypairData};

/// Build the russh server config for the embedded SSH server.
///
/// Derives the SSH host key from the relay signing key so that only a single
/// Ed25519 identity needs to be persisted.
pub fn build_config(signing_key: &SigningKey) -> Arc<Config> {
    let ed25519_private = Ed25519PrivateKey::from_bytes(&signing_key.to_bytes());
    let keypair = Ed25519Keypair::from(ed25519_private);
    let keypair_data = KeypairData::Ed25519(keypair);
    let host_key = russh_keys::PrivateKey::new(keypair_data, "").expect("valid Ed25519 key");

    Arc::new(Config {
        keys: vec![host_key],
        auth_rejection_time: Duration::from_secs(1),
        auth_rejection_time_initial: Some(Duration::from_secs(0)),
        inactivity_timeout: Some(Duration::from_secs(600)),
        keepalive_interval: Some(Duration::from_secs(30)),
        methods: russh::MethodSet::PUBLICKEY,
        ..Default::default()
    })
}
