use db::models::user::GitHubUserProfile;
use reqwest::Client;
use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GitHubOAuthError {
    #[error("Missing GitHub OAuth configuration")]
    MissingConfig,
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Failed to exchange code for token: {0}")]
    TokenExchange(String),
    #[error("Failed to fetch user profile: {0}")]
    UserFetch(String),
}

#[derive(Clone)]
pub struct GitHubOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

impl GitHubOAuthConfig {
    /// Load config from environment variables
    ///
    /// The redirect URI is constructed from APP_HOST and APP_PORT
    pub fn from_env() -> Option<Self> {
        let client_id = std::env::var("GITHUB_CLIENT_ID").ok()?;
        let client_secret = std::env::var("GITHUB_CLIENT_SECRET").ok()?;
        let app_host = std::env::var("APP_HOST").ok()?;
        let app_port = std::env::var("APP_PORT").ok()?;

        let base_url = format!("{}:{}", app_host.trim_end_matches('/'), app_port);
        let redirect_uri = format!("{}/api/local-auth/github/callback", base_url);

        Some(Self {
            client_id,
            client_secret,
            redirect_uri,
        })
    }
}

#[derive(Clone)]
pub struct GitHubOAuthService {
    config: GitHubOAuthConfig,
    client: Client,
}

#[derive(Debug, Deserialize)]
struct GitHubTokenResponse {
    access_token: String,
    #[allow(dead_code)]
    token_type: String,
    #[allow(dead_code)]
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubUserResponse {
    id: i64,
    login: String,
    email: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
}

impl GitHubOAuthService {
    pub fn new(config: GitHubOAuthConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    /// Generate the GitHub OAuth authorization URL
    pub fn authorization_url(&self, state: &str) -> String {
        format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&state={}&scope=read:user%20user:email",
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.redirect_uri),
            urlencoding::encode(state)
        )
    }

    /// Exchange authorization code for access token
    pub async fn exchange_code(&self, code: &str) -> Result<String, GitHubOAuthError> {
        let response = self
            .client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", &self.config.client_id),
                ("client_secret", &self.config.client_secret),
                ("code", &code.to_string()),
                ("redirect_uri", &self.config.redirect_uri),
            ])
            .send()
            .await?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(GitHubOAuthError::TokenExchange(text));
        }

        let token_response: GitHubTokenResponse = response.json().await.map_err(|e| {
            GitHubOAuthError::TokenExchange(format!("Failed to parse token response: {}", e))
        })?;

        Ok(token_response.access_token)
    }

    /// Fetch user profile from GitHub using access token
    pub async fn fetch_user(
        &self,
        access_token: &str,
    ) -> Result<GitHubUserProfile, GitHubOAuthError> {
        let response = self
            .client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "vibe-kanban")
            .send()
            .await?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(GitHubOAuthError::UserFetch(text));
        }

        let user: GitHubUserResponse = response.json().await.map_err(|e| {
            GitHubOAuthError::UserFetch(format!("Failed to parse user response: {}", e))
        })?;

        // If email is not public, try to fetch from /user/emails endpoint
        let email = if user.email.is_some() {
            user.email
        } else {
            self.fetch_primary_email(access_token).await.ok().flatten()
        };

        Ok(GitHubUserProfile {
            id: user.id,
            login: user.login,
            email,
            name: user.name,
            avatar_url: user.avatar_url,
        })
    }

    /// Fetch primary email from GitHub /user/emails endpoint
    async fn fetch_primary_email(
        &self,
        access_token: &str,
    ) -> Result<Option<String>, GitHubOAuthError> {
        #[derive(Debug, Deserialize)]
        struct GitHubEmail {
            email: String,
            primary: bool,
            verified: bool,
        }

        let response = self
            .client
            .get("https://api.github.com/user/emails")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "vibe-kanban")
            .send()
            .await?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let emails: Vec<GitHubEmail> = response.json().await.map_err(|e| {
            GitHubOAuthError::UserFetch(format!("Failed to parse emails response: {}", e))
        })?;

        // Find primary verified email
        let email = emails
            .into_iter()
            .find(|e| e.primary && e.verified)
            .map(|e| e.email);

        Ok(email)
    }
}
