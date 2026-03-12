use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::merge::{Merge, MergeStatus, PrMerge, PullRequestInfo};

#[derive(Debug, Clone, FromRow)]
pub struct TrackedPr {
    pub id: String,
    pub remote_issue_id: Option<String>,
    pub workspace_id: Option<Uuid>,
    pub repo_id: Option<Uuid>,
    pub pr_url: String,
    pub pr_number: i64,
    pub pr_status: MergeStatus,
    pub target_branch_name: String,
    pub merged_at: Option<DateTime<Utc>>,
    pub merge_commit_sha: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl TrackedPr {
    /// Create a tracked PR linked to a remote issue (external, no workspace).
    pub async fn create(
        pool: &SqlitePool,
        remote_issue_id: Uuid,
        pr_url: &str,
        pr_number: i64,
        target_branch_name: &str,
    ) -> Result<(), sqlx::Error> {
        let id = Uuid::new_v4().to_string();
        let issue_id = remote_issue_id.to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO tracked_prs (id, remote_issue_id, pr_url, pr_number, pr_status, target_branch_name)
            VALUES (?, ?, ?, ?, 'open', ?)",
        )
        .bind(&id)
        .bind(&issue_id)
        .bind(pr_url)
        .bind(pr_number)
        .bind(target_branch_name)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Create a tracked PR linked to a workspace (replaces Merge::create_pr).
    pub async fn create_for_workspace(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
        target_branch_name: &str,
        pr_number: i64,
        pr_url: &str,
    ) -> Result<TrackedPr, sqlx::Error> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        sqlx::query(
            "INSERT OR IGNORE INTO tracked_prs (id, workspace_id, repo_id, pr_url, pr_number, pr_status, target_branch_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'open', ?, ?)",
        )
        .bind(&id)
        .bind(workspace_id)
        .bind(repo_id)
        .bind(pr_url)
        .bind(pr_number)
        .bind(target_branch_name)
        .bind(now)
        .execute(pool)
        .await?;

        Ok(TrackedPr {
            id,
            remote_issue_id: None,
            workspace_id: Some(workspace_id),
            repo_id: Some(repo_id),
            pr_url: pr_url.to_string(),
            pr_number,
            pr_status: MergeStatus::Open,
            target_branch_name: target_branch_name.to_string(),
            merged_at: None,
            merge_commit_sha: None,
            created_at: now,
        })
    }

    const SELECT_COLS: &str = "id, remote_issue_id, workspace_id, repo_id, pr_url, pr_number, pr_status, target_branch_name, merged_at, merge_commit_sha, created_at";

    pub async fn get_open(pool: &SqlitePool) -> Result<Vec<TrackedPr>, sqlx::Error> {
        let query = format!(
            "SELECT {} FROM tracked_prs WHERE pr_status = 'open'",
            Self::SELECT_COLS
        );
        sqlx::query_as::<_, TrackedPr>(&query).fetch_all(pool).await
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
            MergeStatus::Unknown => "open",
        };
        sqlx::query(
            "UPDATE tracked_prs SET pr_status = ?, merged_at = ?, merge_commit_sha = ? WHERE pr_url = ?",
        )
        .bind(status_str)
        .bind(merged_at)
        .bind(merge_commit_sha.as_deref())
        .bind(pr_url)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_url(
        pool: &SqlitePool,
        pr_url: &str,
    ) -> Result<Option<TrackedPr>, sqlx::Error> {
        let query = format!(
            "SELECT {} FROM tracked_prs WHERE pr_url = ?",
            Self::SELECT_COLS
        );
        sqlx::query_as::<_, TrackedPr>(&query)
            .bind(pr_url)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<TrackedPr>, sqlx::Error> {
        let query = format!(
            "SELECT {} FROM tracked_prs WHERE workspace_id = ? ORDER BY created_at DESC",
            Self::SELECT_COLS
        );
        sqlx::query_as::<_, TrackedPr>(&query)
            .bind(workspace_id)
            .fetch_all(pool)
            .await
    }

    pub async fn find_by_workspace_and_repo_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Vec<TrackedPr>, sqlx::Error> {
        let query = format!(
            "SELECT {} FROM tracked_prs WHERE workspace_id = ? AND repo_id = ? ORDER BY created_at DESC",
            Self::SELECT_COLS
        );
        sqlx::query_as::<_, TrackedPr>(&query)
            .bind(workspace_id)
            .bind(repo_id)
            .fetch_all(pool)
            .await
    }

    pub async fn count_open_for_workspace(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(1) FROM tracked_prs WHERE workspace_id = ? AND pr_status = 'open'",
        )
        .bind(workspace_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    /// Get the latest PR for each workspace (for workspace summaries).
    pub async fn get_latest_for_workspaces(
        pool: &SqlitePool,
        archived: bool,
    ) -> Result<HashMap<Uuid, TrackedPr>, sqlx::Error> {
        let rows = sqlx::query_as::<_, TrackedPr>(
            "SELECT t.id, t.remote_issue_id, t.workspace_id, t.repo_id, t.pr_url, t.pr_number, t.pr_status, t.target_branch_name, t.merged_at, t.merge_commit_sha, t.created_at
            FROM tracked_prs t
            INNER JOIN (
                SELECT workspace_id, MAX(created_at) as max_created_at
                FROM tracked_prs
                WHERE workspace_id IS NOT NULL
                GROUP BY workspace_id
            ) latest ON t.workspace_id = latest.workspace_id AND t.created_at = latest.max_created_at
            INNER JOIN workspaces w ON t.workspace_id = w.id
            WHERE t.workspace_id IS NOT NULL AND w.archived = ?",
        )
        .bind(archived)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|pr| pr.workspace_id.map(|ws_id| (ws_id, pr)))
            .collect())
    }

    /// Get all tracked PRs that have a workspace (for post-login sync).
    pub async fn find_all_with_workspace(pool: &SqlitePool) -> Result<Vec<TrackedPr>, sqlx::Error> {
        let query = format!(
            "SELECT {} FROM tracked_prs WHERE workspace_id IS NOT NULL ORDER BY created_at ASC",
            Self::SELECT_COLS
        );
        sqlx::query_as::<_, TrackedPr>(&query).fetch_all(pool).await
    }

    /// Convert to PrMerge for API response compatibility.
    /// Only valid for workspace PRs (workspace_id and repo_id must be Some).
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
                title: None,
                base_branch: None,
            },
        }
    }

    /// Convert to a Merge::Pr variant for API response compatibility.
    pub fn to_merge(&self) -> Merge {
        Merge::Pr(self.to_pr_merge())
    }
}
