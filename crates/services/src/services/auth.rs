use std::sync::Arc;

use tokio::{
    sync::RwLock,
    time::{Duration, sleep},
};
use utils::api::oauth::ProfileResponse;

use super::oauth_credentials::{Credentials, OAuthCredentials};

#[derive(Clone)]
pub struct AuthContext {
    oauth: Arc<OAuthCredentials>,
    profile: Arc<RwLock<Option<ProfileResponse>>>,
}

impl AuthContext {
    pub fn new(
        oauth: Arc<OAuthCredentials>,
        profile: Arc<RwLock<Option<ProfileResponse>>>,
    ) -> Self {
        Self { oauth, profile }
    }

    pub async fn wait_for_auth(&self, timeout: Duration) -> Option<(String, String)> {
        let start = tokio::time::Instant::now();
        let poll_interval = Duration::from_millis(100);

        while start.elapsed() < timeout {
            let profile = self.profile.read().await;
            let creds = self.oauth.get().await;

            if let (Some(creds), Some(profile)) = (creds, profile.as_ref()) {
                return Some((creds.access_token, profile.user_id.to_string()));
            }
            drop(profile);
            sleep(poll_interval).await;
        }

        None
    }

    pub async fn get_credentials(&self) -> Option<Credentials> {
        self.oauth.get().await
    }

    pub async fn save_credentials(&self, creds: &Credentials) -> std::io::Result<()> {
        self.oauth.save(creds).await
    }

    pub async fn clear_credentials(&self) -> std::io::Result<()> {
        self.oauth.clear().await
    }

    pub async fn cached_profile(&self) -> Option<ProfileResponse> {
        self.profile.read().await.clone()
    }

    pub async fn set_profile(&self, profile: ProfileResponse) {
        *self.profile.write().await = Some(profile)
    }

    pub async fn clear_profile(&self) {
        *self.profile.write().await = None
    }
}
