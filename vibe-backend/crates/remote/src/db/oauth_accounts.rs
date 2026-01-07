use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum OAuthAccountError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OAuthAccount {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_user_id: String,
    pub email: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct OAuthAccountInsert<'a> {
    pub user_id: Uuid,
    pub provider: &'a str,
    pub provider_user_id: &'a str,
    pub email: Option<&'a str>,
    pub username: Option<&'a str>,
    pub display_name: Option<&'a str>,
    pub avatar_url: Option<&'a str>,
}

pub struct OAuthAccountRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> OAuthAccountRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_by_provider_user(
        &self,
        provider: &str,
        provider_user_id: &str,
    ) -> Result<Option<OAuthAccount>, OAuthAccountError> {
        sqlx::query_as!(
            OAuthAccount,
            r#"
            SELECT
                id                AS "id!: Uuid",
                user_id           AS "user_id!: Uuid",
                provider          AS "provider!",
                provider_user_id  AS "provider_user_id!",
                email             AS "email?",
                username          AS "username?",
                display_name      AS "display_name?",
                avatar_url        AS "avatar_url?",
                created_at        AS "created_at!",
                updated_at        AS "updated_at!"
            FROM oauth_accounts
            WHERE provider = $1
              AND provider_user_id = $2
            "#,
            provider,
            provider_user_id
        )
        .fetch_optional(self.pool)
        .await
        .map_err(OAuthAccountError::from)
    }

    pub async fn list_by_user(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<OAuthAccount>, OAuthAccountError> {
        sqlx::query_as!(
            OAuthAccount,
            r#"
            SELECT
                id                AS "id!: Uuid",
                user_id           AS "user_id!: Uuid",
                provider          AS "provider!",
                provider_user_id  AS "provider_user_id!",
                email             AS "email?",
                username          AS "username?",
                display_name      AS "display_name?",
                avatar_url        AS "avatar_url?",
                created_at        AS "created_at!",
                updated_at        AS "updated_at!"
            FROM oauth_accounts
            WHERE user_id = $1
            ORDER BY provider
            "#,
            user_id
        )
        .fetch_all(self.pool)
        .await
        .map_err(OAuthAccountError::from)
    }

    pub async fn upsert(
        &self,
        account: OAuthAccountInsert<'_>,
    ) -> Result<OAuthAccount, OAuthAccountError> {
        sqlx::query_as!(
            OAuthAccount,
            r#"
            INSERT INTO oauth_accounts (
                user_id,
                provider,
                provider_user_id,
                email,
                username,
                display_name,
                avatar_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (provider, provider_user_id) DO UPDATE
            SET
                email = EXCLUDED.email,
                username = EXCLUDED.username,
                display_name = EXCLUDED.display_name,
                avatar_url = EXCLUDED.avatar_url
            RETURNING
                id                AS "id!: Uuid",
                user_id           AS "user_id!: Uuid",
                provider          AS "provider!",
                provider_user_id  AS "provider_user_id!",
                email             AS "email?",
                username          AS "username?",
                display_name      AS "display_name?",
                avatar_url        AS "avatar_url?",
                created_at        AS "created_at!",
                updated_at        AS "updated_at!"
            "#,
            account.user_id,
            account.provider,
            account.provider_user_id,
            account.email,
            account.username,
            account.display_name,
            account.avatar_url
        )
        .fetch_one(self.pool)
        .await
        .map_err(OAuthAccountError::from)
    }
}
