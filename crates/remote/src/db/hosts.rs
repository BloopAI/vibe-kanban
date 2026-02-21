use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use super::identity_errors::IdentityError;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HostWithAccess {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub name: String,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub agent_version: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub access_role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RelaySession {
    pub id: Uuid,
    pub host_id: Uuid,
    pub request_user_id: Uuid,
    pub state: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub claimed_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
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
        let mut tx = self.pool.begin().await?;

        let host = sqlx::query_as::<_, Host>(
            r#"
            INSERT INTO hosts (owner_user_id, name, status, agent_version)
            VALUES ($1, $2, 'offline', $3)
            RETURNING id, owner_user_id, name, status, last_seen_at, agent_version, created_at, updated_at
            "#,
        )
        .bind(owner_user_id)
        .bind(name)
        .bind(agent_version)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO host_memberships (host_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (host_id, user_id) DO NOTHING
            "#,
        )
        .bind(host.id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(host)
    }

    pub async fn list_accessible_hosts(&self, user_id: Uuid) -> Result<Vec<HostWithAccess>, sqlx::Error> {
        sqlx::query_as::<_, HostWithAccess>(
            r#"
            SELECT
                h.id,
                h.owner_user_id,
                h.name,
                h.status,
                h.last_seen_at,
                h.agent_version,
                h.created_at,
                h.updated_at,
                COALESCE(hm.role, 'owner') AS access_role
            FROM hosts h
            LEFT JOIN host_memberships hm ON hm.host_id = h.id AND hm.user_id = $1
            WHERE h.owner_user_id = $1 OR hm.user_id = $1
            ORDER BY h.last_seen_at DESC NULLS LAST, h.created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(self.pool)
        .await
    }

    pub async fn assert_host_access(&self, host_id: Uuid, user_id: Uuid) -> Result<(), IdentityError> {
        let allowed = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM hosts h
                LEFT JOIN host_memberships hm ON hm.host_id = h.id
                WHERE h.id = $1
                  AND (h.owner_user_id = $2 OR hm.user_id = $2)
            )
            "#,
        )
        .bind(host_id)
        .bind(user_id)
        .fetch_one(self.pool)
        .await?;

        if allowed {
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
        sqlx::query_as::<_, RelaySession>(
            r#"
            INSERT INTO relay_sessions (host_id, request_user_id, state, expires_at)
            VALUES ($1, $2, 'requested', $3)
            RETURNING id, host_id, request_user_id, state, created_at, expires_at, claimed_at, ended_at
            "#,
        )
        .bind(host_id)
        .bind(request_user_id)
        .bind(expires_at)
        .fetch_one(self.pool)
        .await
    }
}
