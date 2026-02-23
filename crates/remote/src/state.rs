use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    analytics::AnalyticsService,
    auth::{JwtService, OAuthHandoffService, OAuthTokenValidator, ProviderRegistry},
    azure_blob::AzureBlobService,
    billing::BillingService,
    config::RemoteServerConfig,
    github_app::GitHubAppService,
    mail::Mailer,
    r2::R2Service,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: RemoteServerConfig,
    pub jwt: Arc<JwtService>,
    pub mailer: Arc<dyn Mailer>,
    pub server_public_base_url: String,
    pub http_client: reqwest::Client,
    handoff: Arc<OAuthHandoffService>,
    oauth_token_validator: Arc<OAuthTokenValidator>,
    r2: Option<R2Service>,
    azure_blob: Option<AzureBlobService>,
    github_app: Option<Arc<GitHubAppService>>,
    billing: BillingService,
    analytics: Option<AnalyticsService>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: PgPool,
        config: RemoteServerConfig,
        jwt: Arc<JwtService>,
        handoff: Arc<OAuthHandoffService>,
        oauth_token_validator: Arc<OAuthTokenValidator>,
        mailer: Arc<dyn Mailer>,
        server_public_base_url: String,
        http_client: reqwest::Client,
        r2: Option<R2Service>,
        azure_blob: Option<AzureBlobService>,
        github_app: Option<Arc<GitHubAppService>>,
        billing: BillingService,
        analytics: Option<AnalyticsService>,
    ) -> Self {
        Self {
            pool,
            config,
            jwt,
            mailer,
            server_public_base_url,
            http_client,
            handoff,
            oauth_token_validator,
            r2,
            azure_blob,
            github_app,
            billing,
            analytics,
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn config(&self) -> &RemoteServerConfig {
        &self.config
    }

    pub fn jwt(&self) -> Arc<JwtService> {
        Arc::clone(&self.jwt)
    }

    pub fn handoff(&self) -> Arc<OAuthHandoffService> {
        Arc::clone(&self.handoff)
    }

    pub fn providers(&self) -> Arc<ProviderRegistry> {
        self.handoff.providers()
    }

    pub fn oauth_token_validator(&self) -> Arc<OAuthTokenValidator> {
        Arc::clone(&self.oauth_token_validator)
    }

    pub fn r2(&self) -> Option<&R2Service> {
        self.r2.as_ref()
    }

    pub fn azure_blob(&self) -> Option<&AzureBlobService> {
        self.azure_blob.as_ref()
    }

    pub fn github_app(&self) -> Option<&GitHubAppService> {
        self.github_app.as_deref()
    }

    pub fn billing(&self) -> &BillingService {
        &self.billing
    }

    pub fn analytics(&self) -> Option<&AnalyticsService> {
        self.analytics.as_ref()
    }
}
