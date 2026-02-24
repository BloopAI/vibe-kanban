use api_types::{RelayHost, RelaySession};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use super::identity_errors::IdentityError;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
pub struct Host {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub name: String,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub agent_version: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct HostRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> HostRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_host(
        &self,
        owner_user_id: Uuid,
        name: &str,
        agent_version: Option<&str>,
    ) -> Result<Host, sqlx::Error> {
        let host = sqlx::query_as!(
            Host,
            r#"
            INSERT INTO hosts (owner_user_id, shared_with_organization_id, name, status, agent_version)
            VALUES ($1, NULL, $2, 'offline', $3)
            RETURNING
                id            AS "id!: Uuid",
                owner_user_id AS "owner_user_id!: Uuid",
                name,
                status,
                last_seen_at,
                agent_version,
                created_at,
                updated_at
            "#,
            owner_user_id,
            name,
            agent_version
        )
        .fetch_one(self.pool)
        .await?;

        Ok(host)
    }

    pub async fn list_accessible_hosts(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<RelayHost>, sqlx::Error> {
        sqlx::query_as!(
            RelayHost,
            r#"
            SELECT
                h.id            AS "id!: Uuid",
                h.owner_user_id AS "owner_user_id!: Uuid",
                h.name,
                h.status,
                h.last_seen_at,
                h.agent_version,
                h.created_at,
                h.updated_at,
                CASE
                    WHEN h.owner_user_id = $1 THEN 'owner'
                    ELSE 'member'
                END AS "access_role!"
            FROM hosts h
            LEFT JOIN organization_member_metadata om
                ON om.organization_id = h.shared_with_organization_id
                AND om.user_id = $1
            WHERE h.owner_user_id = $1 OR om.user_id IS NOT NULL
            ORDER BY h.last_seen_at DESC NULLS LAST, h.created_at DESC
            "#,
            user_id
        )
        .fetch_all(self.pool)
        .await
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
