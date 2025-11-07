use std::env;

use secrecy::SecretString;
use thiserror::Error;

// Default activity items returned in a single query
const DEFAULT_ACTIVITY_DEFAULT_LIMIT: i64 = 200;
// Max activity items that can be requested in a single query
const DEFAULT_ACTIVITY_MAX_LIMIT: i64 = 500;
const DEFAULT_ACTIVITY_BROADCAST_SHARDS: usize = 16;
const DEFAULT_ACTIVITY_BROADCAST_CAPACITY: usize = 512;
const DEFAULT_ACTIVITY_CATCHUP_BATCH_SIZE: i64 = 100;

#[derive(Debug, Clone)]
pub struct RemoteServerConfig {
    pub database_url: String,
    pub listen_addr: String,
    pub activity_channel: String,
    pub activity_default_limit: i64,
    pub activity_max_limit: i64,
    pub activity_broadcast_shards: usize,
    pub activity_broadcast_capacity: usize,
    pub activity_catchup_batch_size: i64,
    pub auth: AuthConfig,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("environment variable `{0}` is not set")]
    MissingVar(&'static str),
    #[error("invalid value for environment variable `{0}`")]
    InvalidVar(&'static str),
}

impl RemoteServerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = env::var("SERVER_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .map_err(|_| ConfigError::MissingVar("SERVER_DATABASE_URL"))?;

        let listen_addr =
            env::var("SERVER_LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8081".to_string());

        let activity_channel =
            env::var("SERVER_ACTIVITY_CHANNEL").unwrap_or_else(|_| "activity".to_string());

        let activity_default_limit = DEFAULT_ACTIVITY_DEFAULT_LIMIT;
        let activity_max_limit = DEFAULT_ACTIVITY_MAX_LIMIT;

        let activity_broadcast_shards = get_numeric_env_var(
            "SERVER_ACTIVITY_BROADCAST_SHARDS",
            DEFAULT_ACTIVITY_BROADCAST_SHARDS,
        )?
        .max(1);

        let activity_broadcast_capacity = get_numeric_env_var(
            "SERVER_ACTIVITY_BROADCAST_CAPACITY",
            DEFAULT_ACTIVITY_BROADCAST_CAPACITY,
        )?
        .max(1);

        let activity_catchup_batch_size = get_numeric_env_var(
            "SERVER_ACTIVITY_CATCHUP_BATCH_SIZE",
            DEFAULT_ACTIVITY_CATCHUP_BATCH_SIZE,
        )?
        .max(1);

        let auth = AuthConfig::from_env()?;

        Ok(Self {
            database_url,
            listen_addr,
            activity_channel,
            activity_default_limit,
            activity_max_limit,
            activity_broadcast_shards,
            activity_broadcast_capacity,
            activity_catchup_batch_size,
            auth,
        })
    }
}

fn get_numeric_env_var<T: std::str::FromStr>(
    var_name: &'static str,
    default: T,
) -> Result<T, ConfigError> {
    match env::var(var_name) {
        Ok(value) => value
            .parse::<T>()
            .map_err(|_| ConfigError::InvalidVar(var_name)),
        Err(_) => Ok(default),
    }
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    github_client_id: String,
    github_client_secret: SecretString,
    jwt_secret: SecretString,
}

impl AuthConfig {
    fn from_env() -> Result<Self, ConfigError> {
        let github_client_id = env::var("GITHUB_OAUTH_CLIENT_ID")
            .map_err(|_| ConfigError::MissingVar("GITHUB_OAUTH_CLIENT_ID"))?;

        let github_client_secret = env::var("GITHUB_OAUTH_CLIENT_SECRET")
            .map_err(|_| ConfigError::MissingVar("GITHUB_OAUTH_CLIENT_SECRET"))
            .map(|value| SecretString::new(value.into()))?;

        let jwt_secret = env::var("REMOTE_JWT_SECRET")
            .map_err(|_| ConfigError::MissingVar("REMOTE_JWT_SECRET"))
            .map(|value| SecretString::new(value.into()))?;

        Ok(Self {
            github_client_id,
            github_client_secret,
            jwt_secret,
        })
    }

    pub fn github_client_id(&self) -> &str {
        &self.github_client_id
    }

    pub fn github_client_secret(&self) -> &SecretString {
        &self.github_client_secret
    }

    pub fn jwt_secret(&self) -> &SecretString {
        &self.jwt_secret
    }
}
