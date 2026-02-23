//! SSH proxy command for relay tunneling.
//!
//! Bridges stdin/stdout to a WebSocket connection to the remote server's
//! SSH relay endpoint. Intended for use as an OpenSSH `ProxyCommand` or
//! VS Code Remote-SSH proxy.
//!
//! Usage:
//!   vibe-kanban-ssh-proxy login --remote-url https://app.example.com
//!   ssh -o ProxyCommand="vibe-kanban-ssh-proxy connect --host-id %h" user@host

mod auth;
mod connect;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(about = "SSH proxy command for relay tunneling")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Authenticate with the remote server via browser OAuth.
    Login {
        /// Remote server base URL (e.g. https://app.example.com)
        #[arg(long, env = "VK_REMOTE_URL")]
        remote_url: String,

        /// OAuth provider to use (default: github)
        #[arg(long, default_value = "github")]
        provider: String,
    },

    /// Connect to a host via the SSH relay (used as ProxyCommand).
    Connect {
        /// Host ID to connect to
        #[arg(long)]
        host_id: String,

        /// Override remote server URL (default: from stored credentials)
        #[arg(long, env = "VK_REMOTE_URL")]
        remote_url: Option<String>,

        /// Override access token (skips token refresh)
        #[arg(long, env = "VK_ACCESS_TOKEN")]
        access_token: Option<String>,

        /// Accept invalid TLS certificates (for development)
        #[arg(long, default_value_t = false)]
        accept_invalid_certs: bool,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Command::Login {
            remote_url,
            provider,
        } => {
            auth::login(&remote_url, &provider).await?;
        }
        Command::Connect {
            host_id,
            remote_url,
            access_token,
            accept_invalid_certs,
        } => {
            let (access_token, remote_url) = match (access_token, remote_url) {
                // Explicit token provided — use directly
                (Some(token), Some(url)) => (token, url),
                (Some(token), None) => {
                    let (_, url) = auth::load_credentials()?;
                    (token, url)
                }
                // No explicit token — load credentials and refresh
                (None, remote_url_override) => {
                    let (refresh_token, stored_url) = auth::load_credentials()?;
                    let url = remote_url_override.unwrap_or(stored_url);
                    let resp = auth::refresh_token(&url, &refresh_token).await?;
                    (resp.access_token, url)
                }
            };

            connect::run(&remote_url, &host_id, &access_token, accept_invalid_certs).await?;
        }
    }

    Ok(())
}
