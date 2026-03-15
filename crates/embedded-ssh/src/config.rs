use std::{sync::Arc, time::Duration};

use russh::server::Config;
use russh_keys::PrivateKey;

/// Build the russh server config for the embedded SSH server.
pub fn build_config(host_key: PrivateKey) -> Arc<Config> {
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
