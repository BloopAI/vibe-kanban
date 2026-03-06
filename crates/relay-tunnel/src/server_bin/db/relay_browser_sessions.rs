use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RelayBrowserSession {
    pub id: Uuid,
    pub host_id: Uuid,
    pub user_id: Uuid,
    pub auth_session_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

pub struct RelayBrowserSessionRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> RelayBrowserSessionRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        host_id: Uuid,
        user_id: Uuid,
        auth_session_id: Uuid,
    ) -> Result<RelayBrowserSession, sqlx::Error> {
        sqlx::query_as!(
            RelayBrowserSession,
            r#"
            INSERT INTO relay_browser_sessions (host_id, user_id, auth_session_id)
            VALUES ($1, $2, $3)
            RETURNING
                id              AS "id!: Uuid",
                host_id         AS "host_id!: Uuid",
                user_id         AS "user_id!: Uuid",
                auth_session_id AS "auth_session_id!: Uuid",
                created_at,
                last_used_at,
                revoked_at
            "#,
            host_id,
            user_id,
            auth_session_id
        )
        .fetch_one(self.pool)
        .await
    }

    pub async fn get(&self, session_id: Uuid) -> Result<Option<RelayBrowserSession>, sqlx::Error> {
        sqlx::query_as!(
            RelayBrowserSession,
            r#"
            SELECT
                id              AS "id!: Uuid",
                host_id         AS "host_id!: Uuid",
                user_id         AS "user_id!: Uuid",
                auth_session_id AS "auth_session_id!: Uuid",
                created_at,
                last_used_at,
                revoked_at
            FROM relay_browser_sessions
            WHERE id = $1
            "#,
            session_id
        )
        .fetch_optional(self.pool)
        .await
    }

    pub async fn touch(&self, session_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE relay_browser_sessions
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

    pub async fn revoke(&self, session_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE relay_browser_sessions
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
