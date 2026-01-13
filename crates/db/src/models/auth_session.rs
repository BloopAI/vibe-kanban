use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct AuthSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

impl AuthSession {
    /// Create a new auth session
    pub async fn create(
        pool: &SqlitePool,
        user_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            AuthSession,
            r#"INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid",
                         user_id as "user_id!: Uuid",
                         token_hash,
                         expires_at as "expires_at!: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         last_used_at as "last_used_at!: DateTime<Utc>",
                         revoked_at as "revoked_at: DateTime<Utc>""#,
            id,
            user_id,
            token_hash,
            expires_at,
        )
        .fetch_one(pool)
        .await
    }

    /// Find a session by token hash (for validation)
    pub async fn find_by_token_hash(
        pool: &SqlitePool,
        token_hash: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            AuthSession,
            r#"SELECT id as "id!: Uuid",
                      user_id as "user_id!: Uuid",
                      token_hash,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      last_used_at as "last_used_at!: DateTime<Utc>",
                      revoked_at as "revoked_at: DateTime<Utc>"
               FROM auth_sessions
               WHERE token_hash = $1"#,
            token_hash
        )
        .fetch_optional(pool)
        .await
    }

    /// Find a session by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            AuthSession,
            r#"SELECT id as "id!: Uuid",
                      user_id as "user_id!: Uuid",
                      token_hash,
                      expires_at as "expires_at!: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      last_used_at as "last_used_at!: DateTime<Utc>",
                      revoked_at as "revoked_at: DateTime<Utc>"
               FROM auth_sessions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Update the last_used_at timestamp
    pub async fn touch(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE auth_sessions
               SET last_used_at = datetime('now', 'subsec')
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Revoke a session
    pub async fn revoke(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE auth_sessions
               SET revoked_at = datetime('now', 'subsec')
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Revoke all sessions for a user
    pub async fn revoke_all_for_user(pool: &SqlitePool, user_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE auth_sessions
               SET revoked_at = datetime('now', 'subsec')
               WHERE user_id = $1 AND revoked_at IS NULL"#,
            user_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Check if session is valid (not expired, not revoked)
    pub fn is_valid(&self) -> bool {
        self.revoked_at.is_none() && self.expires_at > Utc::now()
    }

    /// Delete expired sessions (cleanup)
    pub async fn delete_expired(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"DELETE FROM auth_sessions
               WHERE expires_at < datetime('now')"#
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
