use std::env;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use secrecy::SecretString;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct RemoteServerConfig {
    pub database_url: String,
    pub listen_addr: String,
    pub server_public_base_url: Option<String>,
    pub auth: AuthConfig,
    pub electric_url: String,
    pub electric_secret: Option<SecretString>,
    pub electric_role_password: Option<SecretString>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("environment variable `{0}` is not set")]
    MissingVar(&'static str),
    #[error("invalid value for environment variable `{0}`")]
    InvalidVar(&'static str),
    #[error("no OAuth providers configured")]
    NoOAuthProviders,
}

impl RemoteServerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = env::var("SERVER_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .map_err(|_| ConfigError::MissingVar("SERVER_DATABASE_URL"))?;

        let listen_addr =
            env::var("SERVER_LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8081".to_string());

        let server_public_base_url = env::var("SERVER_PUBLIC_BASE_URL").ok();

        let auth = AuthConfig::from_env()?;

        let electric_url =
            env::var("ELECTRIC_URL").map_err(|_| ConfigError::MissingVar("ELECTRIC_URL"))?;

        let electric_secret = env::var("ELECTRIC_SECRET")
            .map(|s| SecretString::new(s.into()))
            .ok();

        let electric_role_password = env::var("ELECTRIC_ROLE_PASSWORD")
            .ok()
            .map(|s| SecretString::new(s.into()));

        Ok(Self {
            database_url,
            listen_addr,
            server_public_base_url,
            auth,
            electric_url,
            electric_secret,
            electric_role_password,
        })
    }
}

#[derive(Debug, Clone)]
pub struct OAuthProviderConfig {
    client_id: String,
    client_secret: SecretString,
}

impl OAuthProviderConfig {
    fn new(client_id: String, client_secret: SecretString) -> Self {
        Self {
            client_id,
            client_secret,
        }
    }

    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    pub fn client_secret(&self) -> &SecretString {
        &self.client_secret
    }
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    github: Option<OAuthProviderConfig>,
    google: Option<OAuthProviderConfig>,
    jwt_secret: SecretString,
    public_base_url: String,
}

impl AuthConfig {
    fn from_env() -> Result<Self, ConfigError> {
        let jwt_secret = env::var("VIBEKANBAN_REMOTE_JWT_SECRET")
            .map_err(|_| ConfigError::MissingVar("VIBEKANBAN_REMOTE_JWT_SECRET"))?;
        validate_jwt_secret(&jwt_secret)?;
        let jwt_secret = SecretString::new(jwt_secret.into());

        let github = match env::var("GITHUB_OAUTH_CLIENT_ID") {
            Ok(client_id) => {
                let client_secret = env::var("GITHUB_OAUTH_CLIENT_SECRET")
                    .map_err(|_| ConfigError::MissingVar("GITHUB_OAUTH_CLIENT_SECRET"))?;
                Some(OAuthProviderConfig::new(
                    client_id,
                    SecretString::new(client_secret.into()),
                ))
            }
            Err(_) => None,
        };

        let google = match env::var("GOOGLE_OAUTH_CLIENT_ID") {
            Ok(client_id) => {
                let client_secret = env::var("GOOGLE_OAUTH_CLIENT_SECRET")
                    .map_err(|_| ConfigError::MissingVar("GOOGLE_OAUTH_CLIENT_SECRET"))?;
                Some(OAuthProviderConfig::new(
                    client_id,
                    SecretString::new(client_secret.into()),
                ))
            }
            Err(_) => None,
        };

        if github.is_none() && google.is_none() {
            return Err(ConfigError::NoOAuthProviders);
        }

        let public_base_url =
            env::var("SERVER_PUBLIC_BASE_URL").unwrap_or_else(|_| "http://localhost:8081".into());

        Ok(Self {
            github,
            google,
            jwt_secret,
            public_base_url,
        })
    }

    pub fn github(&self) -> Option<&OAuthProviderConfig> {
        self.github.as_ref()
    }

    pub fn google(&self) -> Option<&OAuthProviderConfig> {
        self.google.as_ref()
    }

    pub fn jwt_secret(&self) -> &SecretString {
        &self.jwt_secret
    }

    pub fn public_base_url(&self) -> &str {
        &self.public_base_url
    }
}

fn validate_jwt_secret(secret: &str) -> Result<(), ConfigError> {
    let decoded = BASE64_STANDARD
        .decode(secret.as_bytes())
        .map_err(|_| ConfigError::InvalidVar("VIBEKANBAN_REMOTE_JWT_SECRET"))?;

    if decoded.len() < 32 {
        return Err(ConfigError::InvalidVar("VIBEKANBAN_REMOTE_JWT_SECRET"));
    }

    Ok(())
}
