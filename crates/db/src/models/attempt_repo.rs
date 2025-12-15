use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::repo::Repo;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct AttemptRepo {
    pub id: Uuid,
    pub attempt_id: Uuid,
    pub repo_id: Uuid,
    pub target_branch: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateAttemptRepo {
    pub repo_id: Uuid,
    pub target_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RepoWithTargetBranch {
    #[serde(flatten)]
    pub repo: Repo,
    pub target_branch: String,
}

/// Repo info with copy_files configuration from project_repos.
#[derive(Debug, Clone)]
pub struct RepoWithCopyFiles {
    pub id: Uuid,
    pub path: PathBuf,
    pub name: String,
    pub copy_files: Option<String>,
}

impl AttemptRepo {
    pub async fn create_many(
        pool: &SqlitePool,
        attempt_id: Uuid,
        repos: &[CreateAttemptRepo],
    ) -> Result<Vec<Self>, sqlx::Error> {
        let mut results = Vec::with_capacity(repos.len());

        for repo in repos {
            let id = Uuid::new_v4();
            let attempt_repo = sqlx::query_as!(
                AttemptRepo,
                r#"INSERT INTO attempt_repos (id, attempt_id, repo_id, target_branch)
                   VALUES ($1, $2, $3, $4)
                   RETURNING id as "id!: Uuid",
                             attempt_id as "attempt_id!: Uuid",
                             repo_id as "repo_id!: Uuid",
                             target_branch,
                             created_at as "created_at!: DateTime<Utc>",
                             updated_at as "updated_at!: DateTime<Utc>""#,
                id,
                attempt_id,
                repo.repo_id,
                repo.target_branch
            )
            .fetch_one(pool)
            .await?;
            results.push(attempt_repo);
        }

        Ok(results)
    }

    pub async fn find_by_attempt_id(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            AttemptRepo,
            r#"SELECT id as "id!: Uuid",
                      attempt_id as "attempt_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      target_branch,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM attempt_repos
               WHERE attempt_id = $1"#,
            attempt_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_repos_for_attempt(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<Vec<Repo>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>"
               FROM repos r
               JOIN attempt_repos ar ON r.id = ar.repo_id
               WHERE ar.attempt_id = $1
               ORDER BY r.display_name ASC"#,
            attempt_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_repos_with_target_branch_for_attempt(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<Vec<RepoWithTargetBranch>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>",
                      ar.target_branch
               FROM repos r
               JOIN attempt_repos ar ON r.id = ar.repo_id
               WHERE ar.attempt_id = $1
               ORDER BY r.display_name ASC"#,
            attempt_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| RepoWithTargetBranch {
                repo: Repo {
                    id: row.id,
                    path: PathBuf::from(row.path),
                    name: row.name,
                    display_name: row.display_name,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                },
                target_branch: row.target_branch,
            })
            .collect())
    }

    pub async fn find_by_attempt_and_repo_id(
        pool: &SqlitePool,
        attempt_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            AttemptRepo,
            r#"SELECT id as "id!: Uuid",
                      attempt_id as "attempt_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      target_branch,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM attempt_repos
               WHERE attempt_id = $1 AND repo_id = $2"#,
            attempt_id,
            repo_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn update_target_branch(
        pool: &SqlitePool,
        attempt_id: Uuid,
        repo_id: Uuid,
        new_target_branch: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE attempt_repos SET target_branch = $1, updated_at = datetime('now') WHERE attempt_id = $2 AND repo_id = $3",
            new_target_branch,
            attempt_id,
            repo_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_target_branch_for_children_of_attempt(
        pool: &SqlitePool,
        parent_attempt_id: Uuid,
        old_branch: &str,
        new_branch: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE attempt_repos
               SET target_branch = $1, updated_at = datetime('now')
               WHERE target_branch = $2
                 AND attempt_id IN (
                     SELECT ta.id FROM task_attempts ta
                     JOIN tasks t ON ta.task_id = t.id
                     WHERE t.parent_task_attempt = $3
                 )"#,
            new_branch,
            old_branch,
            parent_attempt_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn find_unique_repos_for_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Repo>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT DISTINCT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>"
               FROM repos r
               JOIN attempt_repos ar ON r.id = ar.repo_id
               JOIN task_attempts ta ON ar.attempt_id = ta.id
               WHERE ta.task_id = $1
               ORDER BY r.display_name ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find repos for an attempt with their copy_files configuration.
    /// Uses LEFT JOIN so repos without project_repo entries still appear (with NULL copy_files).
    pub async fn find_repos_with_copy_files(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<Vec<RepoWithCopyFiles>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT r.id as "id!: Uuid", r.path, r.name, pr.copy_files
               FROM repos r
               JOIN attempt_repos ar ON r.id = ar.repo_id
               JOIN task_attempts ta ON ta.id = ar.attempt_id
               JOIN tasks t ON t.id = ta.task_id
               LEFT JOIN project_repos pr ON pr.project_id = t.project_id AND pr.repo_id = r.id
               WHERE ar.attempt_id = $1"#,
            attempt_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| RepoWithCopyFiles {
                id: row.id,
                path: PathBuf::from(row.path),
                name: row.name,
                copy_files: row.copy_files,
            })
            .collect())
    }
}
