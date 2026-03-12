use api_types::PullRequestIssue;
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use uuid::Uuid;

use super::pull_requests::PullRequestRepository;

#[derive(Debug, Error)]
pub enum PullRequestIssueError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("pull request error: {0}")]
    PullRequest(#[from] super::pull_requests::PullRequestError),
}

pub struct PullRequestIssueRepository;

impl PullRequestIssueRepository {
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<PullRequestIssue>, PullRequestIssueError> {
        let record = sqlx::query_as!(
            PullRequestIssue,
            r#"
            SELECT
                id              AS "id!: Uuid",
                pull_request_id AS "pull_request_id!: Uuid",
                issue_id        AS "issue_id!: Uuid"
            FROM pull_request_issues
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;
        Ok(record)
    }

    pub async fn list_by_issue(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<PullRequestIssue>, PullRequestIssueError> {
        let records = sqlx::query_as!(
            PullRequestIssue,
            r#"
            SELECT
                id              AS "id!: Uuid",
                pull_request_id AS "pull_request_id!: Uuid",
                issue_id        AS "issue_id!: Uuid"
            FROM pull_request_issues
            WHERE issue_id = $1
            "#,
            issue_id
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn list_by_pull_request(
        pool: &PgPool,
        pull_request_id: Uuid,
    ) -> Result<Vec<PullRequestIssue>, PullRequestIssueError> {
        let records = sqlx::query_as!(
            PullRequestIssue,
            r#"
            SELECT
                id              AS "id!: Uuid",
                pull_request_id AS "pull_request_id!: Uuid",
                issue_id        AS "issue_id!: Uuid"
            FROM pull_request_issues
            WHERE pull_request_id = $1
            "#,
            pull_request_id
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<PullRequestIssue>, PullRequestIssueError> {
        let records = sqlx::query_as!(
            PullRequestIssue,
            r#"
            SELECT
                pri.id              AS "id!: Uuid",
                pri.pull_request_id AS "pull_request_id!: Uuid",
                pri.issue_id        AS "issue_id!: Uuid"
            FROM pull_request_issues pri
            INNER JOIN issues i ON pri.issue_id = i.id
            WHERE i.project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn create<'e, E>(
        executor: E,
        pull_request_id: Uuid,
        issue_id: Uuid,
        id: Option<Uuid>,
    ) -> Result<PullRequestIssue, PullRequestIssueError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let record = sqlx::query_as!(
            PullRequestIssue,
            r#"
            INSERT INTO pull_request_issues (id, pull_request_id, issue_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (pull_request_id, issue_id) DO UPDATE
                SET pull_request_id = EXCLUDED.pull_request_id
            RETURNING
                id              AS "id!: Uuid",
                pull_request_id AS "pull_request_id!: Uuid",
                issue_id        AS "issue_id!: Uuid"
            "#,
            id,
            pull_request_id,
            issue_id
        )
        .fetch_one(executor)
        .await?;
        Ok(record)
    }

    pub async fn delete(
        pool: &PgPool,
        pull_request_id: Uuid,
        issue_id: Uuid,
    ) -> Result<(), PullRequestIssueError> {
        sqlx::query!(
            "DELETE FROM pull_request_issues WHERE pull_request_id = $1 AND issue_id = $2",
            pull_request_id,
            issue_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Removes a link and deletes the PR if no links remain. Must be called
    /// within a transaction.
    pub async fn delete_and_cleanup_orphan(
        tx: &mut sqlx::Transaction<'_, Postgres>,
        pull_request_id: Uuid,
        issue_id: Uuid,
    ) -> Result<bool, PullRequestIssueError> {
        sqlx::query!(
            "DELETE FROM pull_request_issues WHERE pull_request_id = $1 AND issue_id = $2",
            pull_request_id,
            issue_id
        )
        .execute(&mut **tx)
        .await?;

        let remaining = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM pull_request_issues WHERE pull_request_id = $1",
            pull_request_id
        )
        .fetch_one(&mut **tx)
        .await?
        .unwrap_or(0);

        if remaining == 0 {
            PullRequestRepository::delete(&mut **tx, pull_request_id).await?;
            return Ok(true);
        }

        Ok(false)
    }

    pub async fn issue_ids_for_pr<'e, E>(
        executor: E,
        pull_request_id: Uuid,
    ) -> Result<Vec<Uuid>, PullRequestIssueError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let ids = sqlx::query_scalar!(
            "SELECT issue_id FROM pull_request_issues WHERE pull_request_id = $1",
            pull_request_id
        )
        .fetch_all(executor)
        .await?;
        Ok(ids)
    }
}
