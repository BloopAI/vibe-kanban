use remote::{Server, config::RemoteServerConfig, init_tracing, sentry_init_once};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    sentry_init_once();
    init_tracing();

    let config = RemoteServerConfig::from_env()?;
    Server::run(config).await
}
