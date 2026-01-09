use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ExecutionProcessRepoState {
    pub id: Uuid,
    pub execution_process_id: Uuid,
    pub repo_id: Uuid,
    pub before_head_commit: Option<String>,
    pub after_head_commit: Option<String>,
    pub merge_commit: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CreateExecutionProcessRepoState {
    pub repo_id: Uuid,
    pub before_head_commit: Option<String>,
    pub after_head_commit: Option<String>,
    pub merge_commit: Option<String>,
}

impl ExecutionProcessRepoState {
    pub async fn create_many(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        entries: &[CreateExecutionProcessRepoState],
    ) -> Result<(), sqlx::Error> {
        if entries.is_empty() {
            return Ok(());
        }

        let now = Utc::now();

        for entry in entries {
            let id = Uuid::new_v4();
            sqlx::query!(
                r#"INSERT INTO execution_process_repo_states (
                        id,
                        execution_process_id,
                        repo_id,
                        before_head_commit,
                        after_head_commit,
                        merge_commit,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
                id,
                execution_process_id,
                entry.repo_id,
                entry.before_head_commit,
                entry.after_head_commit,
                entry.merge_commit,
                now,
                now
            )
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    pub async fn update_before_head_commit(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        repo_id: Uuid,
        before_head_commit: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE execution_process_repo_states
               SET before_head_commit = $1, updated_at = $2
             WHERE execution_process_id = $3
               AND repo_id = $4"#,
            before_head_commit,
            now,
            execution_process_id,
            repo_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_after_head_commit(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        repo_id: Uuid,
        after_head_commit: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE execution_process_repo_states
               SET after_head_commit = $1, updated_at = $2
             WHERE execution_process_id = $3
               AND repo_id = $4"#,
            after_head_commit,
            now,
            execution_process_id,
            repo_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn set_merge_commit(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        repo_id: Uuid,
        merge_commit: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE execution_process_repo_states
               SET merge_commit = $1, updated_at = $2
             WHERE execution_process_id = $3
               AND repo_id = $4"#,
            merge_commit,
            now,
            execution_process_id,
            repo_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_execution_process_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcessRepoState,
            r#"SELECT
                    id               as "id!: Uuid",
                    execution_process_id as "execution_process_id!: Uuid",
                    repo_id as "repo_id!: Uuid",
                    before_head_commit,
                    after_head_commit,
                    merge_commit,
                    created_at as "created_at!: DateTime<Utc>",
                    updated_at as "updated_at!: DateTime<Utc>"
               FROM execution_process_repo_states
               WHERE execution_process_id = $1
               ORDER BY created_at ASC"#,
            execution_process_id
        )
        .fetch_all(pool)
        .await
    }
}
