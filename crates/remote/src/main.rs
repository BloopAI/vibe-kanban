use remote::{BillingService, Server, config::RemoteServerConfig, init_tracing, sentry_init_once};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    sentry_init_once();
    init_tracing();

    let config = RemoteServerConfig::from_env()?;

    #[cfg(feature = "vk-billing")]
    let billing = {
        use std::sync::Arc;

        use billing::{BillingConfig, BillingProvider, StripeBillingProvider};
        use remote::db;

        match BillingConfig::from_env()? {
            Some(billing_config) => {
                let pool = db::create_pool(&config.database_url).await?;
                let provider: Arc<dyn BillingProvider> = Arc::new(StripeBillingProvider::new(
                    pool,
                    billing_config.stripe_secret_key,
                    billing_config.stripe_price_id,
                    billing_config.stripe_webhook_secret,
                    Some(billing_config.free_seat_limit),
                ));
                BillingService::new(Some(provider))
            }
            None => BillingService::new(None),
        }
    };

    #[cfg(not(feature = "vk-billing"))]
    let billing = BillingService::new();

    Server::run(config, billing).await
}
