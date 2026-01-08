use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// An API key for programmatic access (MCP servers, CLI tools, etc.)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: String,
    pub name: String,
    pub key_prefix: String, // First 8 chars for identification
    #[serde(skip_serializing)] // Never expose the hash
    pub key_hash: String,
    pub scopes: Vec<String>,
    #[ts(type = "Date | null")]
    pub last_used_at: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub expires_at: Option<DateTime<Utc>>,
    pub is_revoked: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Response when creating a new API key (includes the full key, only shown once)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApiKeyWithSecret {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    /// The full API key - only returned once at creation time
    pub key: String,
    #[ts(type = "Date | null")]
    pub expires_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// API key info for listing (without sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ApiKeyInfo {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub scopes: Vec<String>,
    #[ts(type = "Date | null")]
    pub last_used_at: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub expires_at: Option<DateTime<Utc>>,
    pub is_revoked: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

impl From<ApiKey> for ApiKeyInfo {
    fn from(key: ApiKey) -> Self {
        Self {
            id: key.id,
            name: key.name,
            key_prefix: key.key_prefix,
            scopes: key.scopes,
            last_used_at: key.last_used_at,
            expires_at: key.expires_at,
            is_revoked: key.is_revoked,
            created_at: key.created_at,
        }
    }
}

/// Request to create a new API key
#[derive(Debug, Deserialize, TS)]
pub struct CreateApiKey {
    pub name: String,
    /// Optional expiration in days (default: no expiration)
    pub expires_in_days: Option<i64>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct ApiKeyRow {
    id: Uuid,
    user_id: String,
    name: String,
    key_prefix: String,
    key_hash: String,
    scopes: Vec<String>,
    last_used_at: Option<DateTime<Utc>>,
    expires_at: Option<DateTime<Utc>>,
    is_revoked: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ApiKeyRow> for ApiKey {
    fn from(row: ApiKeyRow) -> Self {
        Self {
            id: row.id,
            user_id: row.user_id,
            name: row.name,
            key_prefix: row.key_prefix,
            key_hash: row.key_hash,
            scopes: row.scopes,
            last_used_at: row.last_used_at,
            expires_at: row.expires_at,
            is_revoked: row.is_revoked,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl ApiKey {
    /// Generate a new API key string
    /// Format: vk_<random_32_chars>
    fn generate_key() -> String {
        let random_part: String = (0..32)
            .map(|_| {
                let idx = rand::random::<usize>() % 62;
                let chars = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                chars[idx] as char
            })
            .collect();
        format!("vk_{}", random_part)
    }

    /// Hash an API key for storage
    fn hash_key(key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Get the prefix from a key (first 11 chars: "vk_" + 8 chars)
    fn get_prefix(key: &str) -> String {
        key.chars().take(11).collect()
    }

    /// Create a new API key for a user
    pub async fn create(
        pool: &PgPool,
        user_id: &str,
        data: &CreateApiKey,
    ) -> Result<ApiKeyWithSecret, sqlx::Error> {
        let id = Uuid::new_v4();
        let key = Self::generate_key();
        let key_prefix = Self::get_prefix(&key);
        let key_hash = Self::hash_key(&key);

        let expires_at = data.expires_in_days.map(|days| {
            Utc::now() + chrono::Duration::days(days)
        });

        let row = sqlx::query_as!(
            ApiKeyRow,
            r#"INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid",
                         user_id,
                         name,
                         key_prefix,
                         key_hash,
                         scopes,
                         last_used_at as "last_used_at: DateTime<Utc>",
                         expires_at as "expires_at: DateTime<Utc>",
                         is_revoked,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            user_id,
            data.name,
            key_prefix,
            key_hash,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(ApiKeyWithSecret {
            id: row.id,
            name: row.name,
            key_prefix: row.key_prefix,
            key,
            expires_at: row.expires_at,
            created_at: row.created_at,
        })
    }

    /// Find an API key by its hash (for authentication)
    pub async fn find_by_key(pool: &PgPool, key: &str) -> Result<Option<Self>, sqlx::Error> {
        let key_hash = Self::hash_key(key);

        let row = sqlx::query_as!(
            ApiKeyRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      name,
                      key_prefix,
                      key_hash,
                      scopes,
                      last_used_at as "last_used_at: DateTime<Utc>",
                      expires_at as "expires_at: DateTime<Utc>",
                      is_revoked,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM api_keys
               WHERE key_hash = $1 AND NOT is_revoked"#,
            key_hash
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Validate an API key and return the user_id if valid
    pub async fn validate(pool: &PgPool, key: &str) -> Result<Option<String>, sqlx::Error> {
        if let Some(api_key) = Self::find_by_key(pool, key).await? {
            // Check if expired
            if let Some(expires_at) = api_key.expires_at {
                if expires_at < Utc::now() {
                    return Ok(None);
                }
            }

            // Update last_used_at
            sqlx::query!(
                "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
                api_key.id
            )
            .execute(pool)
            .await?;

            return Ok(Some(api_key.user_id));
        }
        Ok(None)
    }

    /// List all API keys for a user
    pub async fn find_by_user(pool: &PgPool, user_id: &str) -> Result<Vec<ApiKeyInfo>, sqlx::Error> {
        let rows = sqlx::query_as!(
            ApiKeyRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      name,
                      key_prefix,
                      key_hash,
                      scopes,
                      last_used_at as "last_used_at: DateTime<Utc>",
                      expires_at as "expires_at: DateTime<Utc>",
                      is_revoked,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM api_keys
               WHERE user_id = $1
               ORDER BY created_at DESC"#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| ApiKey::from(r).into()).collect())
    }

    /// Revoke an API key
    pub async fn revoke(pool: &PgPool, id: Uuid, user_id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE api_keys SET is_revoked = TRUE WHERE id = $1 AND user_id = $2",
            id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete an API key
    pub async fn delete(pool: &PgPool, id: Uuid, user_id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM api_keys WHERE id = $1 AND user_id = $2",
            id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
