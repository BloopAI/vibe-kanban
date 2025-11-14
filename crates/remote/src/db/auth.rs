use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::{PgPool, query_as};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum AuthSessionError {
    #[error("auth session not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct AuthSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub session_secret_hash: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

pub const MAX_SESSION_INACTIVITY_DURATION: Duration = Duration::days(365);

pub struct AuthSessionRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> AuthSessionRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        user_id: Uuid,
        session_secret_hash: Option<&str>,
    ) -> Result<AuthSession, AuthSessionError> {
        query_as!(
            AuthSession,
            r#"
            INSERT INTO auth_sessions (user_id, session_secret_hash)
            VALUES ($1, $2)
            RETURNING
                id                  AS "id!",
                user_id             AS "user_id!: Uuid",
                session_secret_hash AS "session_secret_hash?",
                created_at          AS "created_at!",
                last_used_at        AS "last_used_at?",
                revoked_at          AS "revoked_at?"
            "#,
            user_id,
            session_secret_hash
        )
        .fetch_one(self.pool)
        .await
        .map_err(AuthSessionError::from)
    }

    pub async fn get(&self, session_id: Uuid) -> Result<AuthSession, AuthSessionError> {
        query_as!(
            AuthSession,
            r#"
            SELECT
                id                  AS "id!",
                user_id             AS "user_id!: Uuid",
                session_secret_hash AS "session_secret_hash?",
                created_at          AS "created_at!",
                last_used_at        AS "last_used_at?",
                revoked_at          AS "revoked_at?"
            FROM auth_sessions
            WHERE id = $1
            "#,
            session_id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(AuthSessionError::NotFound)
    }

    pub async fn touch(&self, session_id: Uuid) -> Result<(), AuthSessionError> {
        sqlx::query!(
            r#"
            UPDATE auth_sessions
            SET last_used_at = date_trunc('day', NOW())
            WHERE id = $1
              AND (
                last_used_at IS NULL
                OR last_used_at < date_trunc('day', NOW())
              )
            "#,
            session_id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn revoke(&self, session_id: Uuid) -> Result<(), AuthSessionError> {
        sqlx::query!(
            r#"
            UPDATE auth_sessions
            SET revoked_at = NOW()
            WHERE id = $1
            "#,
            session_id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_secret(
        &self,
        session_id: Uuid,
        session_secret_hash: &str,
    ) -> Result<(), AuthSessionError> {
        sqlx::query!(
            r#"
            UPDATE auth_sessions
            SET session_secret_hash = $2
            WHERE id = $1
            "#,
            session_id,
            session_secret_hash
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }
}

impl AuthSession {
    pub fn last_activity_at(&self) -> DateTime<Utc> {
        self.last_used_at.unwrap_or(self.created_at)
    }

    pub fn inactivity_duration(&self, now: DateTime<Utc>) -> Duration {
        now.signed_duration_since(self.last_activity_at())
    }
}
