mod connect;
mod http;
pub mod tcp;

pub use connect::{RelayClientConfig, start_relay_client};

#[derive(Clone)]
pub struct TcpForwardConfig {
    pub ssh_target_addr: String,
}
