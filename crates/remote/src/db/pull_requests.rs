use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::types::PullRequestStatus;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PullRequest {
    pub id: Uuid,
    pub url: String,
    pub number: i32,
    pub status: PullRequestStatus,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub target_branch_name: String,
    pub issue_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum PullRequestError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct PullRequestRepository;

impl PullRequestRepository {
    pub async fn list_by_issue(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<PullRequest>, PullRequestError> {
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
                issue_id            AS "issue_id!: Uuid",
                workspace_id        AS "workspace_id: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM pull_requests
            WHERE issue_id = $1
            "#,
            issue_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn find_by_url(
        pool: &PgPool,
        url: &str,
    ) -> Result<Option<PullRequest>, PullRequestError> {
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
                issue_id            AS "issue_id!: Uuid",
                workspace_id        AS "workspace_id: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM pull_requests
            WHERE url = $1
            "#,
            url
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        url: String,
        number: i32,
        status: PullRequestStatus,
        merged_at: Option<DateTime<Utc>>,
        merge_commit_sha: Option<String>,
        target_branch_name: String,
        issue_id: Uuid,
        workspace_id: Option<Uuid>,
    ) -> Result<PullRequest, PullRequestError> {
        let id = Uuid::new_v4();
        let record = sqlx::query_as!(
            PullRequest,
            r#"
            INSERT INTO pull_requests (
                id, url, number, status, merged_at, merge_commit_sha,
                target_branch_name, issue_id, workspace_id
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
            issue_id,
            workspace_id
        )
        .fetch_one(pool)
        .await?;

        Ok(record)
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        status: Option<PullRequestStatus>,
        merged_at: Option<Option<DateTime<Utc>>>,
        merge_commit_sha: Option<Option<String>>,
    ) -> Result<PullRequest, PullRequestError> {
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
        .fetch_one(pool)
        .await?;

        Ok(record)
    }
}
