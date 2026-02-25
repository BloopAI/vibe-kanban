use api_types::RelaySession;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::identity_errors::IdentityError;

pub struct HostRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> HostRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn assert_host_access(
        &self,
        host_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), IdentityError> {
        let row = sqlx::query!(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM hosts h
                LEFT JOIN organization_member_metadata om
                    ON om.organization_id = h.shared_with_organization_id
                    AND om.user_id = $2
                WHERE h.id = $1
                  AND (h.owner_user_id = $2 OR om.user_id IS NOT NULL)
            ) AS "allowed!"
            "#,
            host_id,
            user_id
        )
        .fetch_one(self.pool)
        .await?;

        if row.allowed {
            Ok(())
        } else {
            Err(IdentityError::PermissionDenied)
        }
    }

    pub async fn create_session(
        &self,
        host_id: Uuid,
        request_user_id: Uuid,
        expires_at: DateTime<Utc>,
    ) -> Result<RelaySession, sqlx::Error> {
        sqlx::query_as!(
            RelaySession,
            r#"
            INSERT INTO relay_sessions (host_id, request_user_id, state, expires_at)
            VALUES ($1, $2, 'requested', $3)
            RETURNING
                id              AS "id!: Uuid",
                host_id         AS "host_id!: Uuid",
                request_user_id AS "request_user_id!: Uuid",
                state,
                created_at,
                expires_at,
                claimed_at,
                ended_at
            "#,
            host_id,
            request_user_id,
            expires_at
        )
        .fetch_one(self.pool)
        .await
    }
}
