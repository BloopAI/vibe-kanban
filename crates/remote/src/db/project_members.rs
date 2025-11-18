use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMember {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum ProjectMemberError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectMemberRepository;

impl ProjectMemberRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ProjectMember>, ProjectMemberError> {
        let record = sqlx::query_as!(
            ProjectMember,
            r#"
            SELECT
                project_id  AS "project_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                joined_at   AS "joined_at!: DateTime<Utc>"
            FROM project_members
            WHERE project_id = $1 AND user_id = $2
            "#,
            project_id,
            user_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch(
        pool: &PgPool,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ProjectMember>, ProjectMemberError> {
        let record = sqlx::query_as!(
            ProjectMember,
            r#"
            SELECT
                project_id  AS "project_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                joined_at   AS "joined_at!: DateTime<Utc>"
            FROM project_members
            WHERE project_id = $1 AND user_id = $2
            "#,
            project_id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
