use std::env;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use secrecy::SecretString;

#[derive(Debug, Clone)]
pub struct RelayServerConfig {
    pub database_url: String,
    pub listen_addr: String,
    pub jwt_secret: SecretString,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("environment variable `{0}` is not set")]
    MissingVar(&'static str),
    #[error("invalid value for environment variable `{0}`")]
    InvalidVar(&'static str),
}

impl RelayServerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = env::var("SERVER_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .map_err(|_| ConfigError::MissingVar("DATABASE_URL"))?;

        let listen_addr =
            env::var("RELAY_LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8082".to_string());

        let jwt_secret_str = env::var("VIBEKANBAN_REMOTE_JWT_SECRET")
            .map_err(|_| ConfigError::MissingVar("VIBEKANBAN_REMOTE_JWT_SECRET"))?;
        validate_jwt_secret(&jwt_secret_str)?;
        let jwt_secret = SecretString::new(jwt_secret_str.into());

        Ok(Self {
            database_url,
            listen_addr,
            jwt_secret,
        })
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
