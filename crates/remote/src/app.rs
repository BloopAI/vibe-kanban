use std::{net::SocketAddr, sync::Arc};

use anyhow::{Context, bail};
use secrecy::ExposeSecret;
use tracing::instrument;

use crate::{
    AppState,
    auth::{
        GitHubOAuthProvider, GoogleOAuthProvider, JwtService, OAuthHandoffService,
        OAuthTokenValidator, ProviderRegistry,
    },
    config::RemoteServerConfig,
    db,
    github_app::GitHubAppService,
    mail::LoopsMailer,
    r2::R2Service,
    routes,
};

pub struct Server;

impl Server {
    #[instrument(
        name = "remote_server",
        skip(config),
        fields(listen_addr = %config.listen_addr)
    )]
    pub async fn run(config: RemoteServerConfig) -> anyhow::Result<()> {
        let pool = db::create_pool(&config.database_url)
            .await
            .context("failed to create postgres pool")?;

        db::migrate(&pool)
            .await
            .context("failed to run database migrations")?;

        if let Some(password) = config.electric_role_password.as_ref() {
            db::ensure_electric_role_password(&pool, password.expose_secret())
                .await
                .context("failed to set electric role password")?;
        }

        let auth_config = config.auth.clone();
        let jwt = Arc::new(JwtService::new(auth_config.jwt_secret().clone()));

        let mut registry = ProviderRegistry::new();

        if let Some(github) = auth_config.github() {
            registry.register(GitHubOAuthProvider::new(
                github.client_id().to_string(),
                github.client_secret().clone(),
            )?);
        }

        if let Some(google) = auth_config.google() {
            registry.register(GoogleOAuthProvider::new(
                google.client_id().to_string(),
                google.client_secret().clone(),
            )?);
        }

        if registry.is_empty() {
            bail!("no OAuth providers configured");
        }

        let registry = Arc::new(registry);

        let handoff_service = Arc::new(OAuthHandoffService::new(
            pool.clone(),
            registry.clone(),
            jwt.clone(),
            auth_config.public_base_url().to_string(),
        ));

        let oauth_token_validator =
            Arc::new(OAuthTokenValidator::new(pool.clone(), registry.clone()));

        let api_key = std::env::var("LOOPS_EMAIL_API_KEY")
            .context("LOOPS_EMAIL_API_KEY environment variable is required")?;
        let mailer = Arc::new(LoopsMailer::new(api_key));

        let server_public_base_url = config.server_public_base_url.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "SERVER_PUBLIC_BASE_URL is not set. Please set it in your .env.remote file."
            )
        })?;

        let r2 = config.r2.as_ref().map(R2Service::new);
        if r2.is_some() {
            tracing::info!("R2 storage service initialized");
        } else {
            tracing::warn!(
                "R2 storage service not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REVIEW_ENDPOINT, and R2_REVIEW_BUCKET to enable."
            );
        }

        let http_client = reqwest::Client::builder()
            .user_agent("VibeKanbanRemote/1.0")
            .build()
            .context("failed to create HTTP client")?;

        let github_app = match &config.github_app {
            Some(github_config) => {
                match GitHubAppService::new(github_config, http_client.clone()) {
                    Ok(service) => {
                        tracing::info!(
                            app_slug = %github_config.app_slug,
                            "GitHub App service initialized"
                        );
                        Some(Arc::new(service))
                    }
                    Err(e) => {
                        tracing::error!(?e, "Failed to initialize GitHub App service");
                        None
                    }
                }
            }
            None => {
                tracing::info!(
                    "GitHub App not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET, and GITHUB_APP_SLUG to enable."
                );
                None
            }
        };

        let state = AppState::new(
            pool.clone(),
            config.clone(),
            jwt,
            handoff_service,
            oauth_token_validator,
            mailer,
            server_public_base_url,
            http_client,
            r2,
            github_app,
        );

        let router = routes::router(state);
        let addr: SocketAddr = config
            .listen_addr
            .parse()
            .context("listen address is invalid")?;
        let tcp_listener = tokio::net::TcpListener::bind(addr)
            .await
            .context("failed to bind tcp listener")?;

        tracing::info!(%addr, "shared sync server listening");

        let make_service = router.into_make_service();

        axum::serve(tcp_listener, make_service)
            .await
            .context("shared sync server failure")?;

        Ok(())
    }
}
