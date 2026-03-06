pub use api_types::AuthSession;
use chrono::Duration;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum AuthSessionError {
    #[error("auth session not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub const MAX_SESSION_INACTIVITY_DURATION: Duration = Duration::days(365);

pub struct AuthSessionRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> AuthSessionRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, session_id: Uuid) -> Result<AuthSession, AuthSessionError> {
        sqlx::query_as!(
            AuthSession,
            r#"
            SELECT
                id                          AS "id!",
                user_id                     AS "user_id!: Uuid",
                created_at                  AS "created_at!",
                last_used_at                AS "last_used_at?",
                revoked_at                  AS "revoked_at?",
                refresh_token_id           AS "refresh_token_id?",
                refresh_token_issued_at     AS "refresh_token_issued_at?"
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
}
