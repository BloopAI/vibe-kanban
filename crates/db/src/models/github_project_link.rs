use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubProjectLink {
    pub id: Uuid,
    pub project_id: Uuid,
    pub github_project_id: String,
    pub github_owner: String,
    pub github_repo: Option<String>,
    pub sync_enabled: bool,
    pub last_sync_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateGitHubProjectLink {
    pub project_id: Uuid,
    pub github_project_id: String,
    pub github_owner: String,
    pub github_repo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpdateGitHubProjectLink {
    pub sync_enabled: Option<bool>,
}

impl GitHubProjectLink {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubProjectLink,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                github_project_id,
                github_owner,
                github_repo,
                sync_enabled as "sync_enabled!: bool",
                last_sync_at as "last_sync_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_project_links
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubProjectLink,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                github_project_id,
                github_owner,
                github_repo,
                sync_enabled as "sync_enabled!: bool",
                last_sync_at as "last_sync_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_project_links
            WHERE project_id = $1
            ORDER BY created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_enabled_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubProjectLink,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                github_project_id,
                github_owner,
                github_repo,
                sync_enabled as "sync_enabled!: bool",
                last_sync_at as "last_sync_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_project_links
            WHERE project_id = $1 AND sync_enabled = 1
            ORDER BY created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateGitHubProjectLink,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            GitHubProjectLink,
            r#"INSERT INTO github_project_links (id, project_id, github_project_id, github_owner, github_repo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                github_project_id,
                github_owner,
                github_repo,
                sync_enabled as "sync_enabled!: bool",
                last_sync_at as "last_sync_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.github_project_id,
            data.github_owner,
            data.github_repo
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_sync_enabled(
        pool: &SqlitePool,
        id: Uuid,
        sync_enabled: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE github_project_links SET sync_enabled = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id,
            sync_enabled
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_last_sync_at(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE github_project_links SET last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM github_project_links WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
