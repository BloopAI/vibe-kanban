use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::user::User;

#[derive(Debug, Error)]
pub enum SessionError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Session not found")]
    NotFound,
    #[error("Workspace not found")]
    WorkspaceNotFound,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Session {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub executor: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub initiated_by_user_id: Option<Uuid>,
}

/// Compact representation of a user for session API responses
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SessionUser {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
}

impl From<User> for SessionUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
        }
    }
}

/// Session with initiator information for API responses
#[derive(Debug, Clone, Serialize, TS)]
pub struct SessionWithInitiator {
    #[serde(flatten)]
    pub session: Session,
    pub initiated_by: Option<SessionUser>,
}

impl SessionWithInitiator {
    pub fn new(session: Session, initiated_by: Option<User>) -> Self {
        Self {
            session,
            initiated_by: initiated_by.map(SessionUser::from),
        }
    }
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateSession {
    pub executor: Option<String>,
}

impl Session {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Session,
            r#"SELECT id AS "id!: Uuid",
                      workspace_id AS "workspace_id!: Uuid",
                      executor,
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>",
                      initiated_by_user_id AS "initiated_by_user_id: Uuid"
               FROM sessions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find all sessions for a workspace, ordered by most recently used.
    /// "Most recently used" is defined as the most recent non-dev server execution process.
    /// Sessions with no executions fall back to created_at for ordering.
    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Session,
            r#"SELECT s.id AS "id!: Uuid",
                      s.workspace_id AS "workspace_id!: Uuid",
                      s.executor,
                      s.created_at AS "created_at!: DateTime<Utc>",
                      s.updated_at AS "updated_at!: DateTime<Utc>",
                      s.initiated_by_user_id AS "initiated_by_user_id: Uuid"
               FROM sessions s
               LEFT JOIN (
                   SELECT ep.session_id, MAX(ep.created_at) as last_used
                   FROM execution_processes ep
                   WHERE ep.run_reason != 'devserver' AND ep.dropped = FALSE
                   GROUP BY ep.session_id
               ) latest_ep ON s.id = latest_ep.session_id
               WHERE s.workspace_id = $1
               ORDER BY COALESCE(latest_ep.last_used, s.created_at) DESC"#,
            workspace_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find the most recently used session for a workspace.
    /// "Most recently used" is defined as the most recent non-dev server execution process.
    /// Sessions with no executions fall back to created_at for ordering.
    pub async fn find_latest_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Session,
            r#"SELECT s.id AS "id!: Uuid",
                      s.workspace_id AS "workspace_id!: Uuid",
                      s.executor,
                      s.created_at AS "created_at!: DateTime<Utc>",
                      s.updated_at AS "updated_at!: DateTime<Utc>",
                      s.initiated_by_user_id AS "initiated_by_user_id: Uuid"
               FROM sessions s
               LEFT JOIN (
                   SELECT ep.session_id, MAX(ep.created_at) as last_used
                   FROM execution_processes ep
                   WHERE ep.run_reason != 'devserver' AND ep.dropped = FALSE
                   GROUP BY ep.session_id
               ) latest_ep ON s.id = latest_ep.session_id
               WHERE s.workspace_id = $1
               ORDER BY COALESCE(latest_ep.last_used, s.created_at) DESC
               LIMIT 1"#,
            workspace_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateSession,
        id: Uuid,
        workspace_id: Uuid,
        initiated_by_user_id: Option<Uuid>,
    ) -> Result<Self, SessionError> {
        Ok(sqlx::query_as!(
            Session,
            r#"INSERT INTO sessions (id, workspace_id, executor, initiated_by_user_id)
               VALUES ($1, $2, $3, $4)
               RETURNING id AS "id!: Uuid",
                         workspace_id AS "workspace_id!: Uuid",
                         executor,
                         created_at AS "created_at!: DateTime<Utc>",
                         updated_at AS "updated_at!: DateTime<Utc>",
                         initiated_by_user_id AS "initiated_by_user_id: Uuid""#,
            id,
            workspace_id,
            data.executor,
            initiated_by_user_id
        )
        .fetch_one(pool)
        .await?)
    }

    /// Fetch the initiator user for this session, if one exists
    pub async fn get_initiator(&self, pool: &SqlitePool) -> Result<Option<User>, sqlx::Error> {
        match self.initiated_by_user_id {
            Some(user_id) => User::find_by_id(pool, user_id).await,
            None => Ok(None),
        }
    }

    /// Convert this session to a SessionWithInitiator, fetching initiator if available
    pub async fn with_initiator(
        self,
        pool: &SqlitePool,
    ) -> Result<SessionWithInitiator, sqlx::Error> {
        let initiator = self.get_initiator(pool).await?;
        Ok(SessionWithInitiator::new(self, initiator))
    }
}
