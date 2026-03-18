pub mod service;
pub mod ssh_config;
pub mod tunnel;

#[derive(Debug, thiserror::Error)]
pub enum DesktopBridgeError {
    #[error("No home directory found")]
    NoHomeDirectory,
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    SshKey(#[from] ssh_key::Error),
}
