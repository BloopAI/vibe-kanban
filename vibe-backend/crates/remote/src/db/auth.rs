use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::{PgPool, query_as};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum AuthSessionError {
    #[error("auth session not found")]
    NotFound,
    #[error("refresh token reused - possible theft detected")]
    TokenReuseDetected,
    #[error("token has been revoked")]
    TokenRevoked,
    #[error("token has expired")]
    TokenExpired,
    #[error("invalid token")]
    InvalidToken,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct AuthSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub refresh_token_id: Option<Uuid>,
    pub refresh_token_issued_at: Option<DateTime<Utc>>,
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
        refresh_token_id: Option<Uuid>,
    ) -> Result<AuthSession, AuthSessionError> {
        query_as!(
            AuthSession,
            r#"
            INSERT INTO auth_sessions (user_id, refresh_token_id)
            VALUES ($1, $2)
            RETURNING
                id                          AS "id!",
                user_id                     AS "user_id!: Uuid",
                created_at                  AS "created_at!",
                last_used_at                AS "last_used_at?",
                revoked_at                  AS "revoked_at?",
                refresh_token_id           AS "refresh_token_id?",
                refresh_token_issued_at     AS "refresh_token_issued_at?"
            "#,
            user_id,
            refresh_token_id
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

    pub async fn rotate_tokens(
        &self,
        session_id: Uuid,
        old_refresh_token_id: Uuid,
        new_refresh_token_id: Uuid,
    ) -> Result<(), AuthSessionError> {
        let mut tx = self.pool.begin().await.map_err(AuthSessionError::from)?;

        let updated = sqlx::query!(
            r#"
            UPDATE auth_sessions
            SET refresh_token_id = $3,
                refresh_token_issued_at = NOW()
            WHERE id = $1
              AND refresh_token_id = $2
            RETURNING user_id
            "#,
            session_id,
            old_refresh_token_id,
            new_refresh_token_id
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(AuthSessionError::from)?;

        let Some(row) = updated else {
            tx.rollback().await.map_err(AuthSessionError::from)?;
            return Err(AuthSessionError::TokenReuseDetected);
        };

        // Revoke the old refresh token
        sqlx::query!(
            r#"
            INSERT INTO revoked_refresh_tokens (token_id, user_id, revoked_reason)
            VALUES ($1, $2, 'token_rotation')
            ON CONFLICT (token_id) DO NOTHING
            "#,
            old_refresh_token_id,
            row.user_id
        )
        .execute(&mut *tx)
        .await
        .map_err(AuthSessionError::from)?;

        tx.commit().await.map_err(AuthSessionError::from)?;
        Ok(())
    }

    pub async fn set_current_refresh_token(
        &self,
        session_id: Uuid,
        refresh_token_id: Uuid,
    ) -> Result<(), AuthSessionError> {
        sqlx::query!(
            r#"
            UPDATE auth_sessions
            SET refresh_token_id = $2,
                refresh_token_issued_at = NOW()
            WHERE id = $1
            "#,
            session_id,
            refresh_token_id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn revoke_all_user_sessions(&self, user_id: Uuid) -> Result<i64, AuthSessionError> {
        let mut tx = self.pool.begin().await.map_err(AuthSessionError::from)?;

        sqlx::query!(
            r#"
            INSERT INTO revoked_refresh_tokens (token_id, user_id, revoked_reason)
            SELECT refresh_token_id, user_id, 'reuse_of_revoked_token'
            FROM auth_sessions
            WHERE user_id = $1
              AND refresh_token_id IS NOT NULL
            ON CONFLICT (token_id) DO NOTHING
            "#,
            user_id
        )
        .execute(&mut *tx)
        .await
        .map_err(AuthSessionError::from)?;

        let update_result = sqlx::query!(
            r#"
            UPDATE auth_sessions
            SET revoked_at = NOW()
            WHERE user_id = $1
              AND revoked_at IS NULL
            "#,
            user_id
        )
        .execute(&mut *tx)
        .await
        .map_err(AuthSessionError::from)?;

        tx.commit().await.map_err(AuthSessionError::from)?;

        Ok(update_result.rows_affected() as i64)
    }

    pub async fn is_refresh_token_revoked(&self, token_id: Uuid) -> Result<bool, AuthSessionError> {
        let result = sqlx::query!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM revoked_refresh_tokens WHERE token_id = $1
            ) as is_revoked
            "#,
            token_id
        )
        .fetch_one(self.pool)
        .await
        .map_err(AuthSessionError::from)?;

        Ok(result.is_revoked.unwrap_or(false))
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

impl AuthSession {
    pub fn last_activity_at(&self) -> DateTime<Utc> {
        self.last_used_at.unwrap_or(self.created_at)
    }

    pub fn inactivity_duration(&self, now: DateTime<Utc>) -> Duration {
        now.signed_duration_since(self.last_activity_at())
    }
}
