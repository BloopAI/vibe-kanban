use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Type};
use ts_rs::TS;
use uuid::Uuid;

use super::pull_request::PullRequest;

#[derive(Debug, Clone, Serialize, Deserialize, TS, Type)]
#[sqlx(type_name = "merge_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum MergeStatus {
    Open,
    Merged,
    Closed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Merge {
    Direct(DirectMerge),
    Pr(PrMerge),
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DirectMerge {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub merge_commit: String,
    pub target_branch_name: String,
    pub created_at: DateTime<Utc>,
}

/// PR merge - represents a pull request merge
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrMerge {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub target_branch_name: String,
    pub pr_info: PullRequestInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PullRequestInfo {
    pub number: i64,
    pub url: String,
    pub status: MergeStatus,
    pub merged_at: Option<chrono::DateTime<chrono::Utc>>,
    pub merge_commit_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum MergeType {
    Direct,
    Pr,
}

/// Row type for direct merges only (PR data now lives in pull_requests).
struct DirectMergeRow {
    id: Uuid,
    workspace_id: Uuid,
    repo_id: Uuid,
    merge_commit: Option<String>,
    target_branch_name: String,
    created_at: DateTime<Utc>,
}

impl Merge {
    pub fn merge_commit(&self) -> Option<String> {
        match self {
            Merge::Direct(direct) => Some(direct.merge_commit.clone()),
            Merge::Pr(pr) => pr.pr_info.merge_commit_sha.clone(),
        }
    }

    /// Create a direct merge record
    pub async fn create_direct(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
        target_branch_name: &str,
        merge_commit: &str,
    ) -> Result<DirectMerge, sqlx::Error> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query!(
            "INSERT INTO merges (id, workspace_id, repo_id, merge_type, merge_commit, created_at, target_branch_name)
            VALUES (?, ?, ?, 'direct', ?, ?, ?)",
            id,
            workspace_id,
            repo_id,
            merge_commit,
            now,
            target_branch_name,
        )
        .execute(pool)
        .await?;

        Ok(DirectMerge {
            id,
            workspace_id,
            repo_id,
            merge_commit: merge_commit.to_string(),
            target_branch_name: target_branch_name.to_string(),
            created_at: now,
        })
    }

    /// Find all merges for a workspace (returns both direct merges and PRs).
    /// Direct merges come from the `merges` table, PRs from `pull_requests`.
    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let direct_rows = sqlx::query_as!(
            DirectMergeRow,
            r#"SELECT
                id AS "id!: Uuid",
                workspace_id AS "workspace_id!: Uuid",
                repo_id AS "repo_id!: Uuid",
                merge_commit,
                target_branch_name,
                created_at AS "created_at!: DateTime<Utc>"
            FROM merges
            WHERE workspace_id = ? AND merge_type = 'direct'
            ORDER BY created_at DESC"#,
            workspace_id,
        )
        .fetch_all(pool)
        .await?;

        let pull_requests = PullRequest::find_by_workspace_id(pool, workspace_id).await?;

        let mut merges: Vec<Merge> = direct_rows.into_iter().map(|row| row.into()).collect();
        merges.extend(pull_requests.iter().map(|pr| pr.to_merge()));

        // Sort by created_at descending (matching previous behavior)
        merges.sort_by(|a, b| {
            let a_time = match a {
                Merge::Direct(d) => d.created_at,
                Merge::Pr(p) => p.created_at,
            };
            let b_time = match b {
                Merge::Direct(d) => d.created_at,
                Merge::Pr(p) => p.created_at,
            };
            b_time.cmp(&a_time)
        });

        Ok(merges)
    }

    /// Find all merges for a workspace and specific repo
    pub async fn find_by_workspace_and_repo_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let direct_rows = sqlx::query_as!(
            DirectMergeRow,
            r#"SELECT
                id AS "id!: Uuid",
                workspace_id AS "workspace_id!: Uuid",
                repo_id AS "repo_id!: Uuid",
                merge_commit,
                target_branch_name,
                created_at AS "created_at!: DateTime<Utc>"
            FROM merges
            WHERE workspace_id = ? AND repo_id = ? AND merge_type = 'direct'
            ORDER BY created_at DESC"#,
            workspace_id,
            repo_id,
        )
        .fetch_all(pool)
        .await?;

        let pull_requests =
            PullRequest::find_by_workspace_and_repo_id(pool, workspace_id, repo_id).await?;

        let mut merges: Vec<Merge> = direct_rows.into_iter().map(|row| row.into()).collect();
        merges.extend(pull_requests.iter().map(|pr| pr.to_merge()));

        merges.sort_by(|a, b| {
            let a_time = match a {
                Merge::Direct(d) => d.created_at,
                Merge::Pr(p) => p.created_at,
            };
            let b_time = match b {
                Merge::Direct(d) => d.created_at,
                Merge::Pr(p) => p.created_at,
            };
            b_time.cmp(&a_time)
        });

        Ok(merges)
    }
}

impl From<DirectMergeRow> for DirectMerge {
    fn from(row: DirectMergeRow) -> Self {
        DirectMerge {
            id: row.id,
            workspace_id: row.workspace_id,
            repo_id: row.repo_id,
            merge_commit: row
                .merge_commit
                .expect("direct merge must have merge_commit"),
            target_branch_name: row.target_branch_name,
            created_at: row.created_at,
        }
    }
}

impl From<DirectMergeRow> for Merge {
    fn from(row: DirectMergeRow) -> Self {
        Merge::Direct(DirectMerge::from(row))
    }
}
