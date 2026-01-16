use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "sync_direction", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SyncDirection {
    #[default]
    Bidirectional,
    GithubToVibe,
    VibeToGithub,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitHubIssueMapping {
    pub id: Uuid,
    pub task_id: Uuid,
    pub github_project_link_id: Uuid,
    pub github_issue_number: i64,
    pub github_issue_id: String,
    pub github_issue_url: String,
    pub sync_direction: SyncDirection,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub github_updated_at: Option<DateTime<Utc>>,
    pub vibe_updated_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateGitHubIssueMapping {
    pub task_id: Uuid,
    pub github_project_link_id: Uuid,
    pub github_issue_number: i64,
    pub github_issue_id: String,
    pub github_issue_url: String,
    pub sync_direction: Option<SyncDirection>,
}

impl GitHubIssueMapping {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueMapping,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                github_project_link_id as "github_project_link_id!: Uuid",
                github_issue_number as "github_issue_number!: i64",
                github_issue_id,
                github_issue_url,
                sync_direction as "sync_direction!: SyncDirection",
                last_synced_at as "last_synced_at: DateTime<Utc>",
                github_updated_at as "github_updated_at: DateTime<Utc>",
                vibe_updated_at as "vibe_updated_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_issue_mappings
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueMapping,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                github_project_link_id as "github_project_link_id!: Uuid",
                github_issue_number as "github_issue_number!: i64",
                github_issue_id,
                github_issue_url,
                sync_direction as "sync_direction!: SyncDirection",
                last_synced_at as "last_synced_at: DateTime<Utc>",
                github_updated_at as "github_updated_at: DateTime<Utc>",
                vibe_updated_at as "vibe_updated_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_issue_mappings
            WHERE task_id = $1"#,
            task_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_github_issue(
        pool: &SqlitePool,
        github_project_link_id: Uuid,
        github_issue_number: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueMapping,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                github_project_link_id as "github_project_link_id!: Uuid",
                github_issue_number as "github_issue_number!: i64",
                github_issue_id,
                github_issue_url,
                sync_direction as "sync_direction!: SyncDirection",
                last_synced_at as "last_synced_at: DateTime<Utc>",
                github_updated_at as "github_updated_at: DateTime<Utc>",
                vibe_updated_at as "vibe_updated_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_issue_mappings
            WHERE github_project_link_id = $1 AND github_issue_number = $2"#,
            github_project_link_id,
            github_issue_number
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_link_id(
        pool: &SqlitePool,
        github_project_link_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitHubIssueMapping,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                github_project_link_id as "github_project_link_id!: Uuid",
                github_issue_number as "github_issue_number!: i64",
                github_issue_id,
                github_issue_url,
                sync_direction as "sync_direction!: SyncDirection",
                last_synced_at as "last_synced_at: DateTime<Utc>",
                github_updated_at as "github_updated_at: DateTime<Utc>",
                vibe_updated_at as "vibe_updated_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM github_issue_mappings
            WHERE github_project_link_id = $1
            ORDER BY github_issue_number ASC"#,
            github_project_link_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateGitHubIssueMapping,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let sync_direction = data.sync_direction.clone().unwrap_or_default();
        sqlx::query_as!(
            GitHubIssueMapping,
            r#"INSERT INTO github_issue_mappings (id, task_id, github_project_link_id, github_issue_number, github_issue_id, github_issue_url, sync_direction)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                github_project_link_id as "github_project_link_id!: Uuid",
                github_issue_number as "github_issue_number!: i64",
                github_issue_id,
                github_issue_url,
                sync_direction as "sync_direction!: SyncDirection",
                last_synced_at as "last_synced_at: DateTime<Utc>",
                github_updated_at as "github_updated_at: DateTime<Utc>",
                vibe_updated_at as "vibe_updated_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.task_id,
            data.github_project_link_id,
            data.github_issue_number,
            data.github_issue_id,
            data.github_issue_url,
            sync_direction
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_sync_timestamps(
        pool: &SqlitePool,
        id: Uuid,
        github_updated_at: Option<DateTime<Utc>>,
        vibe_updated_at: Option<DateTime<Utc>>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE github_issue_mappings
            SET last_synced_at = CURRENT_TIMESTAMP,
                github_updated_at = $2,
                vibe_updated_at = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1"#,
            id,
            github_updated_at,
            vibe_updated_at
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM github_issue_mappings WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
