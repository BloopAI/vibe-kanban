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

    pub async fn add(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<ProjectMember, ProjectMemberError> {
        let joined_at = Utc::now();
        let record = sqlx::query_as!(
            ProjectMember,
            r#"
            INSERT INTO project_members (project_id, user_id, joined_at)
            VALUES ($1, $2, $3)
            RETURNING
                project_id  AS "project_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                joined_at   AS "joined_at!: DateTime<Utc>"
            "#,
            project_id,
            user_id,
            joined_at
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn add_with_pool(
        pool: &PgPool,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<ProjectMember, ProjectMemberError> {
        let mut tx = pool.begin().await?;
        let record = Self::add(&mut tx, project_id, user_id).await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn remove(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), ProjectMemberError> {
        sqlx::query!(
            "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
            project_id,
            user_id
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn remove_with_pool(
        pool: &PgPool,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), ProjectMemberError> {
        let mut tx = pool.begin().await?;
        Self::remove(&mut tx, project_id, user_id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_by_project(
        tx: &mut Tx<'_>,
        project_id: Uuid,
    ) -> Result<Vec<ProjectMember>, ProjectMemberError> {
        let records = sqlx::query_as!(
            ProjectMember,
            r#"
            SELECT
                project_id  AS "project_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                joined_at   AS "joined_at!: DateTime<Utc>"
            FROM project_members
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(&mut **tx)
        .await?;

        Ok(records)
    }

    pub async fn fetch_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectMember>, ProjectMemberError> {
        let records = sqlx::query_as!(
            ProjectMember,
            r#"
            SELECT
                project_id  AS "project_id!: Uuid",
                user_id     AS "user_id!: Uuid",
                joined_at   AS "joined_at!: DateTime<Utc>"
            FROM project_members
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
