use chrono::{DateTime, Duration, Utc};
use secrecy::{ExposeSecret, SecretString};
use sqlx::{PgPool, query_as};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GitHubAccountError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GitHubAccount {
    pub user_id: String,
    pub github_id: i64,
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub access_token: String,
    pub token_type: String,
    pub scopes: Vec<String>,
    pub token_expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct GitHubAccountRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> GitHubAccountRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn upsert(
        &self,
        user_id: &str,
        github_id: i64,
        login: &str,
        name: Option<&str>,
        email: Option<&str>,
        avatar_url: Option<&str>,
        access_token: &SecretString,
        token_type: &str,
        scopes: &[String],
        expires_in: Option<Duration>,
    ) -> Result<GitHubAccount, GitHubAccountError> {
        let token_expires_at = expires_in.map(|delta| Utc::now() + delta);
        query_as!(
            GitHubAccount,
            r#"
            INSERT INTO github_accounts (
                user_id,
                github_id,
                login,
                name,
                email,
                avatar_url,
                access_token,
                token_type,
                scopes,
                token_expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id) DO UPDATE
            SET
                github_id = EXCLUDED.github_id,
                login = EXCLUDED.login,
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                avatar_url = EXCLUDED.avatar_url,
                access_token = EXCLUDED.access_token,
                token_type = EXCLUDED.token_type,
                scopes = EXCLUDED.scopes,
                token_expires_at = EXCLUDED.token_expires_at,
                updated_at = NOW()
            RETURNING
                user_id         AS "user_id!",
                github_id       AS "github_id!",
                login           AS "login!",
                name            AS "name?",
                email           AS "email?",
                avatar_url      AS "avatar_url?",
                access_token    AS "access_token!",
                token_type      AS "token_type!",
                scopes          AS "scopes!",
                token_expires_at AS "token_expires_at?",
                created_at      AS "created_at!",
                updated_at      AS "updated_at!"
            "#,
            user_id,
            github_id,
            login,
            name,
            email,
            avatar_url,
            access_token.expose_secret(),
            token_type,
            &scopes,
            token_expires_at
        )
        .fetch_one(self.pool)
        .await
        .map_err(GitHubAccountError::from)
    }

    pub async fn get_by_user_id(
        &self,
        user_id: &str,
    ) -> Result<Option<GitHubAccount>, GitHubAccountError> {
        query_as!(
            GitHubAccount,
            r#"
            SELECT
                user_id         AS "user_id!",
                github_id       AS "github_id!",
                login           AS "login!",
                name            AS "name?",
                email           AS "email?",
                avatar_url      AS "avatar_url?",
                access_token    AS "access_token!",
                token_type      AS "token_type!",
                scopes          AS "scopes!",
                token_expires_at AS "token_expires_at?",
                created_at      AS "created_at!",
                updated_at      AS "updated_at!"
            FROM github_accounts
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_optional(self.pool)
        .await
        .map_err(GitHubAccountError::from)
    }
}
