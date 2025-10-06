use remote::{Server, config::RemoteServerConfig, init_tracing};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();
    let config = RemoteServerConfig::from_env()?;
    Server::run(config).await
}
