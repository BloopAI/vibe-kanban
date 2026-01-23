use remote::{Server, config::RemoteServerConfig, init_tracing, sentry_init_once};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    sentry_init_once();
    init_tracing();

    let config = RemoteServerConfig::from_env()?;
    Server::run(config).await
}
