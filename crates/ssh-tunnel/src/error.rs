use thiserror::Error;

#[derive(Error, Debug)]
pub enum SshTunnelError {
    #[error("SSH connection failed: {0}")]
    Connection(#[from] russh::Error),
    #[error("SSH key error: {0}")]
    Key(#[from] russh_keys::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Authentication failed")]
    AuthFailed,
    #[error("Channel open failed")]
    ChannelOpenFailed,
}
