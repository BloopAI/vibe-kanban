use chrono::Utc;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use crate::nodes::{CreateNodeApiKey, NodeApiKey};

#[derive(Debug, Error)]
pub enum NodeApiKeyError {
    #[error("API key not found")]
    NotFound,
    #[error("API key revoked")]
    Revoked,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct NodeApiKeyRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> NodeApiKeyRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Create a new API key. Returns the key record and the raw key value (only available at creation).
    pub async fn create(
        &self,
        organization_id: Uuid,
        data: CreateNodeApiKey,
        created_by: Uuid,
        key_hash: &str,
        key_prefix: &str,
    ) -> Result<NodeApiKey, NodeApiKeyError> {
        let key = sqlx::query_as::<_, NodeApiKey>(
            r#"
            INSERT INTO node_api_keys (organization_id, name, key_hash, key_prefix, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                organization_id,
                name,
                key_hash,
                key_prefix,
                created_by,
                last_used_at,
                revoked_at,
                created_at
            "#,
        )
        .bind(organization_id)
        .bind(&data.name)
        .bind(key_hash)
        .bind(key_prefix)
        .bind(created_by)
        .fetch_one(self.pool)
        .await?;

        Ok(key)
    }

    /// Find an API key by its prefix (first 8 chars) for validation
    pub async fn find_by_prefix(&self, prefix: &str) -> Result<Option<NodeApiKey>, NodeApiKeyError> {
        let key = sqlx::query_as::<_, NodeApiKey>(
            r#"
            SELECT
                id,
                organization_id,
                name,
                key_hash,
                key_prefix,
                created_by,
                last_used_at,
                revoked_at,
                created_at
            FROM node_api_keys
            WHERE key_prefix = $1
            "#,
        )
        .bind(prefix)
        .fetch_optional(self.pool)
        .await?;

        Ok(key)
    }

    /// List all API keys for an organization
    pub async fn list_by_organization(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<NodeApiKey>, NodeApiKeyError> {
        let keys = sqlx::query_as::<_, NodeApiKey>(
            r#"
            SELECT
                id,
                organization_id,
                name,
                key_hash,
                key_prefix,
                created_by,
                last_used_at,
                revoked_at,
                created_at
            FROM node_api_keys
            WHERE organization_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(organization_id)
        .fetch_all(self.pool)
        .await?;

        Ok(keys)
    }

    /// Update the last_used_at timestamp
    pub async fn touch(&self, key_id: Uuid) -> Result<(), NodeApiKeyError> {
        sqlx::query(
            r#"
            UPDATE node_api_keys
            SET last_used_at = $2
            WHERE id = $1
            "#,
        )
        .bind(key_id)
        .bind(Utc::now())
        .execute(self.pool)
        .await?;

        Ok(())
    }

    /// Revoke an API key
    pub async fn revoke(&self, key_id: Uuid) -> Result<(), NodeApiKeyError> {
        let result = sqlx::query(
            r#"
            UPDATE node_api_keys
            SET revoked_at = $2
            WHERE id = $1 AND revoked_at IS NULL
            "#,
        )
        .bind(key_id)
        .bind(Utc::now())
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeApiKeyError::NotFound);
        }

        Ok(())
    }

    /// Delete an API key permanently
    pub async fn delete(&self, key_id: Uuid) -> Result<(), NodeApiKeyError> {
        let result = sqlx::query(
            r#"
            DELETE FROM node_api_keys
            WHERE id = $1
            "#,
        )
        .bind(key_id)
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(NodeApiKeyError::NotFound);
        }

        Ok(())
    }
}
