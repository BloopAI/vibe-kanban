use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::merge::{Merge, MergeStatus, PrMerge, PullRequestInfo};

#[derive(Debug, Clone, FromRow)]
pub struct PullRequest {
    pub id: String,
    pub workspace_id: Option<Uuid>,
    pub repo_id: Option<Uuid>,
    pub pr_url: String,
    pub pr_number: i64,
    pub pr_status: MergeStatus,
    pub target_branch_name: String,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub synced_at: Option<DateTime<Utc>>,
}

impl PullRequest {
    pub async fn create(
        pool: &SqlitePool,
        workspace_id: Option<Uuid>,
        repo_id: Option<Uuid>,
        pr_url: &str,
        pr_number: i64,
        target_branch_name: &str,
    ) -> Result<PullRequest, sqlx::Error> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        sqlx::query!(
            "INSERT INTO pull_requests (id, workspace_id, repo_id, pr_url, pr_number, pr_status, target_branch_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
            ON CONFLICT(pr_url) DO UPDATE SET
                workspace_id = COALESCE(pull_requests.workspace_id, excluded.workspace_id),
                repo_id = COALESCE(pull_requests.repo_id, excluded.repo_id),
                updated_at = CURRENT_TIMESTAMP",
            id,
            workspace_id,
            repo_id,
            pr_url,
            pr_number,
            target_branch_name,
            now,
        )
        .execute(pool)
        .await?;

        let pr = Self::find_by_url(pool, pr_url)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        Ok(pr)
    }

    pub async fn create_for_workspace(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
        target_branch_name: &str,
        pr_number: i64,
        pr_url: &str,
    ) -> Result<PullRequest, sqlx::Error> {
        Self::create(
            pool,
            Some(workspace_id),
            Some(repo_id),
            pr_url,
            pr_number,
            target_branch_name,
        )
        .await
    }

    pub async fn get_open(pool: &SqlitePool) -> Result<Vec<PullRequest>, sqlx::Error> {
        sqlx::query_as!(
            PullRequest,
            r#"SELECT
                id,
                workspace_id AS "workspace_id: Uuid",
                repo_id AS "repo_id: Uuid",
                pr_url,
                pr_number,
                pr_status AS "pr_status: MergeStatus",
                target_branch_name,
                merged_at AS "merged_at: DateTime<Utc>",
                merge_commit_sha,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>",
                synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests
            WHERE pr_status = 'open'"#,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        pr_url: &str,
        status: &MergeStatus,
        merged_at: Option<DateTime<Utc>>,
        merge_commit_sha: Option<String>,
    ) -> Result<(), sqlx::Error> {
        let status_str = match status {
            MergeStatus::Open => "open",
            MergeStatus::Merged => "merged",
            MergeStatus::Closed => "closed",
            MergeStatus::Unknown => "unknown",
        };
        let now = Utc::now();
        sqlx::query!(
            "UPDATE pull_requests SET pr_status = ?, merged_at = ?, merge_commit_sha = ?, updated_at = ?, synced_at = NULL WHERE pr_url = ?",
            status_str,
            merged_at,
            merge_commit_sha,
            now,
            pr_url,
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_url(
        pool: &SqlitePool,
        pr_url: &str,
    ) -> Result<Option<PullRequest>, sqlx::Error> {
        sqlx::query_as!(
            PullRequest,
            r#"SELECT
                id,
                workspace_id AS "workspace_id: Uuid",
                repo_id AS "repo_id: Uuid",
                pr_url,
                pr_number,
                pr_status AS "pr_status: MergeStatus",
                target_branch_name,
                merged_at AS "merged_at: DateTime<Utc>",
                merge_commit_sha,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>",
                synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests
            WHERE pr_url = $1"#,
            pr_url,
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<PullRequest>, sqlx::Error> {
        sqlx::query_as!(
            PullRequest,
            r#"SELECT
                id,
                workspace_id AS "workspace_id: Uuid",
                repo_id AS "repo_id: Uuid",
                pr_url,
                pr_number,
                pr_status AS "pr_status: MergeStatus",
                target_branch_name,
                merged_at AS "merged_at: DateTime<Utc>",
                merge_commit_sha,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>",
                synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests
            WHERE workspace_id = $1
            ORDER BY created_at DESC"#,
            workspace_id,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_workspace_and_repo_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Vec<PullRequest>, sqlx::Error> {
        sqlx::query_as!(
            PullRequest,
            r#"SELECT
                id,
                workspace_id AS "workspace_id: Uuid",
                repo_id AS "repo_id: Uuid",
                pr_url,
                pr_number,
                pr_status AS "pr_status: MergeStatus",
                target_branch_name,
                merged_at AS "merged_at: DateTime<Utc>",
                merge_commit_sha,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>",
                synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests
            WHERE workspace_id = $1 AND repo_id = $2
            ORDER BY created_at DESC"#,
            workspace_id,
            repo_id,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn count_open_for_workspace(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query!(
            r#"SELECT COUNT(1) AS "count!: i64" FROM pull_requests WHERE workspace_id = ? AND pr_status = 'open'"#,
            workspace_id,
        )
        .fetch_one(pool)
        .await?;
        Ok(row.count)
    }

    pub async fn get_latest_for_workspaces(
        pool: &SqlitePool,
        archived: bool,
    ) -> Result<HashMap<Uuid, PullRequest>, sqlx::Error> {
        let rows = sqlx::query_as!(
            PullRequest,
            r#"SELECT
                t.id,
                t.workspace_id AS "workspace_id: Uuid",
                t.repo_id AS "repo_id: Uuid",
                t.pr_url,
                t.pr_number,
                t.pr_status AS "pr_status: MergeStatus",
                t.target_branch_name,
                t.merged_at AS "merged_at: DateTime<Utc>",
                t.merge_commit_sha,
                t.created_at AS "created_at!: DateTime<Utc>",
                t.updated_at AS "updated_at!: DateTime<Utc>",
                t.synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests t
            INNER JOIN (
                SELECT workspace_id, MAX(created_at) as max_created_at
                FROM pull_requests
                WHERE workspace_id IS NOT NULL
                GROUP BY workspace_id
            ) latest ON t.workspace_id = latest.workspace_id AND t.created_at = latest.max_created_at
            INNER JOIN workspaces w ON t.workspace_id = w.id
            WHERE t.workspace_id IS NOT NULL AND w.archived = $1"#,
            archived,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|pr| pr.workspace_id.map(|ws_id| (ws_id, pr)))
            .collect())
    }

    pub async fn find_all_with_workspace(
        pool: &SqlitePool,
    ) -> Result<Vec<PullRequest>, sqlx::Error> {
        sqlx::query_as!(
            PullRequest,
            r#"SELECT
                id,
                workspace_id AS "workspace_id: Uuid",
                repo_id AS "repo_id: Uuid",
                pr_url,
                pr_number,
                pr_status AS "pr_status: MergeStatus",
                target_branch_name,
                merged_at AS "merged_at: DateTime<Utc>",
                merge_commit_sha,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>",
                synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests
            WHERE workspace_id IS NOT NULL
            ORDER BY created_at ASC"#,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn get_pending_sync(pool: &SqlitePool) -> Result<Vec<PullRequest>, sqlx::Error> {
        sqlx::query_as!(
            PullRequest,
            r#"SELECT
                id,
                workspace_id AS "workspace_id: Uuid",
                repo_id AS "repo_id: Uuid",
                pr_url,
                pr_number,
                pr_status AS "pr_status: MergeStatus",
                target_branch_name,
                merged_at AS "merged_at: DateTime<Utc>",
                merge_commit_sha,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>",
                synced_at AS "synced_at: DateTime<Utc>"
            FROM pull_requests
            WHERE synced_at IS NULL OR synced_at < updated_at"#,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn mark_synced(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            "UPDATE pull_requests SET synced_at = ? WHERE id = ?",
            now,
            id,
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub fn to_pr_merge(&self) -> PrMerge {
        PrMerge {
            id: Uuid::parse_str(&self.id).unwrap_or_else(|_| Uuid::nil()),
            workspace_id: self.workspace_id.unwrap_or_else(Uuid::nil),
            repo_id: self.repo_id.unwrap_or_else(Uuid::nil),
            created_at: self.created_at,
            target_branch_name: self.target_branch_name.clone(),
            pr_info: PullRequestInfo {
                number: self.pr_number,
                url: self.pr_url.clone(),
                status: self.pr_status.clone(),
                merged_at: self.merged_at,
                merge_commit_sha: self.merge_commit_sha.clone(),
            },
        }
    }

    pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM pull_requests WHERE id = ?", id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub fn to_merge(&self) -> Merge {
        Merge::Pr(self.to_pr_merge())
    }
}
