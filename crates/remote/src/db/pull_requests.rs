use api_types::{PullRequest, PullRequestStatus};
use chrono::{DateTime, Utc};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum PullRequestError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct PullRequestRepository;

#[allow(deprecated)]
impl PullRequestRepository {
    pub async fn list_by_issue<'e, E>(
        executor: E,
        issue_id: Uuid,
    ) -> Result<Vec<PullRequest>, PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            PullRequest,
            r#"
            SELECT
                p.id                  AS "id!: Uuid",
                p.url                 AS "url!: String",
                p.number              AS "number!: i32",
                p.status              AS "status!: PullRequestStatus",
                p.merged_at           AS "merged_at: DateTime<Utc>",
                p.merge_commit_sha    AS "merge_commit_sha: String",
                p.target_branch_name  AS "target_branch_name!: String",
                p.project_id          AS "project_id!: Uuid",
                p.issue_id            AS "issue_id!: Uuid",
                p.workspace_id        AS "workspace_id: Uuid",
                p.created_at          AS "created_at!: DateTime<Utc>",
                p.updated_at          AS "updated_at!: DateTime<Utc>"
            FROM pull_requests p
            INNER JOIN pull_request_issues pri ON p.id = pri.pull_request_id
            WHERE pri.issue_id = $1
            "#,
            issue_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    pub async fn list_by_project<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<Vec<PullRequest>, PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            PullRequest,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                url                 AS "url!: String",
                number              AS "number!: i32",
                status              AS "status!: PullRequestStatus",
                merged_at           AS "merged_at: DateTime<Utc>",
                merge_commit_sha    AS "merge_commit_sha: String",
                target_branch_name  AS "target_branch_name!: String",
                project_id          AS "project_id!: Uuid",
                issue_id            AS "issue_id!: Uuid",
                workspace_id        AS "workspace_id: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM pull_requests
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(executor)
        .await?;
        Ok(records)
    }

    /// Returns all PR rows matching a URL that belong to projects the user is a member of.
    pub async fn list_by_url_for_user<'e, E>(
        executor: E,
        url: &str,
        user_id: Uuid,
    ) -> Result<Vec<PullRequest>, PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            PullRequest,
            r#"
            SELECT
                p.id                  AS "id!: Uuid",
                p.url                 AS "url!: String",
                p.number              AS "number!: i32",
                p.status              AS "status!: PullRequestStatus",
                p.merged_at           AS "merged_at: DateTime<Utc>",
                p.merge_commit_sha    AS "merge_commit_sha: String",
                p.target_branch_name  AS "target_branch_name!: String",
                p.project_id          AS "project_id!: Uuid",
                p.issue_id            AS "issue_id!: Uuid",
                p.workspace_id        AS "workspace_id: Uuid",
                p.created_at          AS "created_at!: DateTime<Utc>",
                p.updated_at          AS "updated_at!: DateTime<Utc>"
            FROM pull_requests p
            INNER JOIN projects proj ON p.project_id = proj.id
            INNER JOIN organization_member_metadata omm
                ON omm.organization_id = proj.organization_id
                AND omm.user_id = $2
            WHERE p.url = $1
            "#,
            url,
            user_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    pub async fn find_by_url_and_project<'e, E>(
        executor: E,
        url: &str,
        project_id: Uuid,
    ) -> Result<Option<PullRequest>, PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            PullRequest,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                url                 AS "url!: String",
                number              AS "number!: i32",
                status              AS "status!: PullRequestStatus",
                merged_at           AS "merged_at: DateTime<Utc>",
                merge_commit_sha    AS "merge_commit_sha: String",
                target_branch_name  AS "target_branch_name!: String",
                project_id          AS "project_id!: Uuid",
                issue_id            AS "issue_id!: Uuid",
                workspace_id        AS "workspace_id: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM pull_requests
            WHERE url = $1 AND project_id = $2
            "#,
            url,
            project_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create<'e, E>(
        executor: E,
        url: String,
        number: i32,
        status: PullRequestStatus,
        merged_at: Option<DateTime<Utc>>,
        merge_commit_sha: Option<String>,
        target_branch_name: String,
        project_id: Uuid,
        issue_id: Uuid,
    ) -> Result<PullRequest, PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let record = sqlx::query_as!(
            PullRequest,
            r#"
            INSERT INTO pull_requests (
                id, url, number, status, merged_at, merge_commit_sha,
                target_branch_name, project_id, issue_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id                  AS "id!: Uuid",
                url                 AS "url!: String",
                number              AS "number!: i32",
                status              AS "status!: PullRequestStatus",
                merged_at           AS "merged_at: DateTime<Utc>",
                merge_commit_sha    AS "merge_commit_sha: String",
                target_branch_name  AS "target_branch_name!: String",
                project_id          AS "project_id!: Uuid",
                issue_id            AS "issue_id!: Uuid",
                workspace_id        AS "workspace_id: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            url,
            number,
            status as PullRequestStatus,
            merged_at,
            merge_commit_sha,
            target_branch_name,
            project_id,
            issue_id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        status: Option<PullRequestStatus>,
        merged_at: Option<Option<DateTime<Utc>>>,
        merge_commit_sha: Option<Option<String>>,
    ) -> Result<PullRequest, PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let update_status = status.is_some();
        let status_value = status.unwrap_or(PullRequestStatus::Open);

        let update_merged_at = merged_at.is_some();
        let merged_at_value = merged_at.flatten();

        let update_merge_commit_sha = merge_commit_sha.is_some();
        let merge_commit_sha_value = merge_commit_sha.flatten();

        let record = sqlx::query_as!(
            PullRequest,
            r#"
            UPDATE pull_requests SET
                status = CASE WHEN $1 THEN $2 ELSE status END,
                merged_at = CASE WHEN $3 THEN $4 ELSE merged_at END,
                merge_commit_sha = CASE WHEN $5 THEN $6 ELSE merge_commit_sha END,
                updated_at = NOW()
            WHERE id = $7
            RETURNING
                id                  AS "id!: Uuid",
                url                 AS "url!: String",
                number              AS "number!: i32",
                status              AS "status!: PullRequestStatus",
                merged_at           AS "merged_at: DateTime<Utc>",
                merge_commit_sha    AS "merge_commit_sha: String",
                target_branch_name  AS "target_branch_name!: String",
                project_id          AS "project_id!: Uuid",
                issue_id            AS "issue_id!: Uuid",
                workspace_id        AS "workspace_id: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            "#,
            update_status,
            status_value as PullRequestStatus,
            update_merged_at,
            merged_at_value,
            update_merge_commit_sha,
            merge_commit_sha_value,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), PullRequestError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM pull_requests WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }
}
