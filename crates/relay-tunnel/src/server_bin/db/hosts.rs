use api_types::RelaySession;
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

    /// Find or create a host for the given user and machine identity.
    /// If a host with the same owner and machine_id exists, returns it and updates name/version.
    /// Otherwise, creates a new one.
    pub async fn upsert_host(
        &self,
        owner_user_id: Uuid,
        machine_id: &str,
        name: &str,
        agent_version: Option<&str>,
    ) -> Result<Uuid, sqlx::Error> {
        let row = sqlx::query!(
            r#"
            INSERT INTO hosts (
                owner_user_id,
                shared_with_organization_id,
                machine_id,
                name,
                status,
                agent_version
            )
            VALUES ($1, NULL, $2, $3, 'offline', $4)
            ON CONFLICT (owner_user_id, machine_id) DO UPDATE
                SET name = EXCLUDED.name,
                    agent_version = COALESCE(EXCLUDED.agent_version, hosts.agent_version),
                    updated_at = NOW()
            RETURNING id AS "id!: Uuid"
            "#,
            owner_user_id,
            machine_id,
            name,
            agent_version
        )
        .fetch_one(self.pool)
        .await?;

        Ok(row.id)
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

    pub async fn is_host_online(&self, host_id: Uuid) -> Result<bool, sqlx::Error> {
        let row = sqlx::query!(r#"SELECT status FROM hosts WHERE id = $1"#, host_id)
            .fetch_optional(self.pool)
            .await?;
        Ok(row.map(|r| r.status == "online").unwrap_or(false))
    }

    pub async fn get_session_for_requester(
        &self,
        session_id: Uuid,
        request_user_id: Uuid,
    ) -> Result<Option<RelaySession>, sqlx::Error> {
        sqlx::query_as!(
            RelaySession,
            r#"
            SELECT
                id              AS "id!: Uuid",
                host_id         AS "host_id!: Uuid",
                request_user_id AS "request_user_id!: Uuid",
                state,
                created_at,
                expires_at,
                claimed_at,
                ended_at
            FROM relay_sessions
            WHERE id = $1 AND request_user_id = $2
            "#,
            session_id,
            request_user_id
        )
        .fetch_optional(self.pool)
        .await
    }

    pub async fn mark_session_active(&self, session_id: Uuid) -> Result<RelaySession, sqlx::Error> {
        sqlx::query_as!(
            RelaySession,
            r#"
            UPDATE relay_sessions
            SET state = 'active',
                claimed_at = COALESCE(claimed_at, NOW())
            WHERE id = $1
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
            session_id
        )
        .fetch_one(self.pool)
        .await
    }

    pub async fn mark_session_expired(&self, session_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE relay_sessions
            SET state = 'expired',
                ended_at = COALESCE(ended_at, NOW())
            WHERE id = $1
            "#,
            session_id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_host_online(
        &self,
        host_id: Uuid,
        agent_version: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE hosts
            SET status = 'online',
                last_seen_at = NOW(),
                agent_version = COALESCE($2, agent_version),
                updated_at = NOW()
            WHERE id = $1
            "#,
            host_id,
            agent_version
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_host_offline(&self, host_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE hosts
            SET status = 'offline',
                updated_at = NOW()
            WHERE id = $1
            "#,
            host_id
        )
        .execute(self.pool)
        .await?;
        Ok(())
    }
}
