use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS, Type)]
#[sqlx(type_name = "merge_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum MergeStatus {
    Open,
    Merged,
    Closed,
    Unknown,
}

/// CI/GitHub Actions check status for a PR
#[derive(Debug, Clone, Serialize, Deserialize, TS, Type, PartialEq, Default)]
#[sqlx(type_name = "ci_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum CiStatus {
    /// CI checks are passing (all required checks succeeded)
    Passing,
    /// CI checks are failing (at least one required check failed)
    Failing,
    /// CI checks are still running
    Pending,
    /// No CI checks configured or status unknown
    #[default]
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
    /// CI/GitHub Actions check status for this PR
    #[serde(default)]
    pub ci_status: CiStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum MergeType {
    Direct,
    Pr,
}

#[derive(FromRow)]
struct MergeRow {
    id: Uuid,
    workspace_id: Uuid,
    repo_id: Uuid,
    merge_type: MergeType,
    merge_commit: Option<String>,
    target_branch_name: String,
    pr_number: Option<i64>,
    pr_url: Option<String>,
    pr_status: Option<MergeStatus>,
    pr_merged_at: Option<DateTime<Utc>>,
    pr_merge_commit_sha: Option<String>,
    pr_ci_status: Option<CiStatus>,
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

        sqlx::query_as!(
            MergeRow,
            r#"INSERT INTO merges (
                id, workspace_id, repo_id, merge_type, merge_commit, created_at, target_branch_name
            ) VALUES ($1, $2, $3, 'direct', $4, $5, $6)
            RETURNING
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                merge_type as "merge_type!: MergeType",
                merge_commit,
                pr_number,
                pr_url,
                pr_status as "pr_status?: MergeStatus",
                pr_merged_at as "pr_merged_at?: DateTime<Utc>",
                pr_merge_commit_sha,
                pr_ci_status as "pr_ci_status?: CiStatus",
                created_at as "created_at!: DateTime<Utc>",
                target_branch_name as "target_branch_name!: String"
            "#,
            id,
            workspace_id,
            repo_id,
            merge_commit,
            now,
            target_branch_name
        )
        .fetch_one(pool)
        .await
        .map(Into::into)
    }
    /// Create a new PR record (when PR is opened)
    pub async fn create_pr(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
        target_branch_name: &str,
        pr_number: i64,
        pr_url: &str,
    ) -> Result<PrMerge, sqlx::Error> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query_as!(
            MergeRow,
            r#"INSERT INTO merges (
                id, workspace_id, repo_id, merge_type, pr_number, pr_url, pr_status, created_at, target_branch_name
            ) VALUES ($1, $2, $3, 'pr', $4, $5, 'open', $6, $7)
            RETURNING
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                merge_type as "merge_type!: MergeType",
                merge_commit,
                pr_number,
                pr_url,
                pr_status as "pr_status?: MergeStatus",
                pr_merged_at as "pr_merged_at?: DateTime<Utc>",
                pr_merge_commit_sha,
                pr_ci_status as "pr_ci_status?: CiStatus",
                created_at as "created_at!: DateTime<Utc>",
                target_branch_name as "target_branch_name!: String"
            "#,
            id,
            workspace_id,
            repo_id,
            pr_number,
            pr_url,
            now,
            target_branch_name
        )
        .fetch_one(pool)
        .await
        .map(Into::into)
    }

    /// Get all open PRs for monitoring
    pub async fn get_open_prs(pool: &SqlitePool) -> Result<Vec<PrMerge>, sqlx::Error> {
        let rows = sqlx::query_as!(
            MergeRow,
            r#"SELECT
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                merge_type as "merge_type!: MergeType",
                merge_commit,
                pr_number,
                pr_url,
                pr_status as "pr_status?: MergeStatus",
                pr_merged_at as "pr_merged_at?: DateTime<Utc>",
                pr_merge_commit_sha,
                pr_ci_status as "pr_ci_status?: CiStatus",
                created_at as "created_at!: DateTime<Utc>",
                target_branch_name as "target_branch_name!: String"
               FROM merges
               WHERE merge_type = 'pr' AND pr_status = 'open'
               ORDER BY created_at DESC"#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Update PR status for a workspace
    pub async fn update_status(
        pool: &SqlitePool,
        merge_id: Uuid,
        pr_status: MergeStatus,
        merge_commit_sha: Option<String>,
        ci_status: CiStatus,
    ) -> Result<(), sqlx::Error> {
        let merged_at = if matches!(pr_status, MergeStatus::Merged) {
            Some(Utc::now())
        } else {
            None
        };

        sqlx::query!(
            r#"UPDATE merges
            SET pr_status = $1,
                pr_merge_commit_sha = $2,
                pr_merged_at = $3,
                pr_ci_status = $4
            WHERE id = $5"#,
            pr_status,
            merge_commit_sha,
            merged_at,
            ci_status,
            merge_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update just the CI status for a PR
    pub async fn update_ci_status(
        pool: &SqlitePool,
        merge_id: Uuid,
        ci_status: CiStatus,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE merges SET pr_ci_status = $1 WHERE id = $2"#,
            ci_status,
            merge_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }
    /// Find all merges for a workspace (returns both direct and PR merges)
    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        // Get raw data from database
        let rows = sqlx::query_as!(
            MergeRow,
            r#"SELECT
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                merge_type as "merge_type!: MergeType",
                merge_commit,
                pr_number,
                pr_url,
                pr_status as "pr_status?: MergeStatus",
                pr_merged_at as "pr_merged_at?: DateTime<Utc>",
                pr_merge_commit_sha,
                pr_ci_status as "pr_ci_status?: CiStatus",
                target_branch_name as "target_branch_name!: String",
                created_at as "created_at!: DateTime<Utc>"
            FROM merges
            WHERE workspace_id = $1
            ORDER BY created_at DESC"#,
            workspace_id
        )
        .fetch_all(pool)
        .await?;

        // Convert to appropriate types based on merge_type
        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Find all merges for a workspace and specific repo
    pub async fn find_by_workspace_and_repo_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            MergeRow,
            r#"SELECT
                id as "id!: Uuid",
                workspace_id as "workspace_id!: Uuid",
                repo_id as "repo_id!: Uuid",
                merge_type as "merge_type!: MergeType",
                merge_commit,
                pr_number,
                pr_url,
                pr_status as "pr_status?: MergeStatus",
                pr_merged_at as "pr_merged_at?: DateTime<Utc>",
                pr_merge_commit_sha,
                pr_ci_status as "pr_ci_status?: CiStatus",
                target_branch_name as "target_branch_name!: String",
                created_at as "created_at!: DateTime<Utc>"
            FROM merges
            WHERE workspace_id = $1 AND repo_id = $2
            ORDER BY created_at DESC"#,
            workspace_id,
            repo_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Get the latest PR status for each workspace (for workspace summaries)
    /// Returns a map of workspace_id -> MergeStatus for workspaces that have PRs
    pub async fn get_latest_pr_status_for_workspaces(
        pool: &SqlitePool,
        archived: bool,
    ) -> Result<HashMap<Uuid, MergeStatus>, sqlx::Error> {
        #[derive(FromRow)]
        struct PrStatusRow {
            workspace_id: Uuid,
            pr_status: Option<MergeStatus>,
        }

        // Get the latest PR for each workspace by using a subquery to find the max created_at
        // Only consider PR merges (not direct merges)
        let rows = sqlx::query_as::<_, PrStatusRow>(
            r#"SELECT
                m.workspace_id,
                m.pr_status
            FROM merges m
            INNER JOIN (
                SELECT workspace_id, MAX(created_at) as max_created_at
                FROM merges
                WHERE merge_type = 'pr'
                GROUP BY workspace_id
            ) latest ON m.workspace_id = latest.workspace_id
                AND m.created_at = latest.max_created_at
            INNER JOIN workspaces w ON m.workspace_id = w.id
            WHERE m.merge_type = 'pr' AND w.archived = $1"#,
        )
        .bind(archived)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|row| row.pr_status.map(|status| (row.workspace_id, status)))
            .collect())
    }

    /// Get the latest PR status for each task (via workspaces)
    /// Returns a map of task_id -> MergeStatus for tasks that have PRs through their workspaces
    pub async fn get_latest_pr_status_for_tasks(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<HashMap<Uuid, MergeStatus>, sqlx::Error> {
        let statuses = Self::get_latest_pr_and_ci_status_for_tasks(pool, project_id).await?;
        Ok(statuses
            .into_iter()
            .filter_map(|(task_id, (pr_status, _))| pr_status.map(|s| (task_id, s)))
            .collect())
    }

    /// Get the latest PR and CI status for each task (via workspaces)
    /// Returns a map of task_id -> (MergeStatus, CiStatus) for tasks that have PRs
    pub async fn get_latest_pr_and_ci_status_for_tasks(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<HashMap<Uuid, (Option<MergeStatus>, Option<CiStatus>)>, sqlx::Error> {
        #[derive(FromRow)]
        struct TaskPrStatusRow {
            task_id: Uuid,
            pr_status: Option<MergeStatus>,
            pr_ci_status: Option<CiStatus>,
        }

        // Get the latest PR status for each task by joining:
        // tasks -> workspaces -> merges
        // We want the most recent PR status across all workspaces for a task
        let rows = sqlx::query_as::<_, TaskPrStatusRow>(
            r#"SELECT
                w.task_id,
                m.pr_status,
                m.pr_ci_status
            FROM merges m
            INNER JOIN (
                SELECT w2.task_id, MAX(m2.created_at) as max_created_at
                FROM merges m2
                INNER JOIN workspaces w2 ON m2.workspace_id = w2.id
                INNER JOIN tasks t ON w2.task_id = t.id
                WHERE m2.merge_type = 'pr' AND t.project_id = $1
                GROUP BY w2.task_id
            ) latest ON m.created_at = latest.max_created_at
            INNER JOIN workspaces w ON m.workspace_id = w.id AND w.task_id = latest.task_id
            WHERE m.merge_type = 'pr'"#,
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| (row.task_id, (row.pr_status, row.pr_ci_status)))
            .collect())
    }
}

// Conversion implementations
impl From<MergeRow> for DirectMerge {
    fn from(row: MergeRow) -> Self {
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

impl From<MergeRow> for PrMerge {
    fn from(row: MergeRow) -> Self {
        PrMerge {
            id: row.id,
            workspace_id: row.workspace_id,
            repo_id: row.repo_id,
            target_branch_name: row.target_branch_name,
            pr_info: PullRequestInfo {
                number: row.pr_number.expect("pr merge must have pr_number"),
                url: row.pr_url.expect("pr merge must have pr_url"),
                status: row.pr_status.expect("pr merge must have status"),
                merged_at: row.pr_merged_at,
                merge_commit_sha: row.pr_merge_commit_sha,
                ci_status: row.pr_ci_status.unwrap_or_default(),
            },
            created_at: row.created_at,
        }
    }
}

impl From<MergeRow> for Merge {
    fn from(row: MergeRow) -> Self {
        match row.merge_type {
            MergeType::Direct => Merge::Direct(DirectMerge::from(row)),
            MergeType::Pr => Merge::Pr(PrMerge::from(row)),
        }
    }
}
