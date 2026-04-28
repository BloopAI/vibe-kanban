use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ts_rs::TS;
use uuid::Uuid;

use super::repo::Repo;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub uat_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectRepoWithRepo {
    #[serde(flatten)]
    pub repo: Repo,
    pub uat_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectRepoInput {
    pub repo_id: Uuid,
    pub uat_branch: Option<String>,
}

impl ProjectRepo {
    pub async fn list_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectRepoWithRepo>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.setup_script,
                      r.cleanup_script,
                      r.archive_script,
                      r.copy_files,
                      r.parallel_setup_script as "parallel_setup_script!: bool",
                      r.dev_server_script,
                      r.default_target_branch,
                      r.default_working_dir,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>",
                      pr.uat_branch
               FROM project_repos pr
               JOIN repos r ON r.id = pr.repo_id
               WHERE pr.project_id = $1
               ORDER BY r.display_name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ProjectRepoWithRepo {
                repo: Repo {
                    id: row.id,
                    path: PathBuf::from(row.path),
                    name: row.name,
                    display_name: row.display_name,
                    setup_script: row.setup_script,
                    cleanup_script: row.cleanup_script,
                    archive_script: row.archive_script,
                    copy_files: row.copy_files,
                    parallel_setup_script: row.parallel_setup_script,
                    dev_server_script: row.dev_server_script,
                    default_target_branch: row.default_target_branch,
                    default_working_dir: row.default_working_dir,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                },
                uat_branch: row.uat_branch,
            })
            .collect())
    }

    /// Replace the set of (repo, uat_branch) entries linked to a project.
    /// Existing entries that aren't in `entries` are removed; new entries are
    /// inserted; entries already linked have their `uat_branch` updated.
    pub async fn replace_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
        entries: &[ProjectRepoInput],
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        sqlx::query!(
            "DELETE FROM project_repos WHERE project_id = $1",
            project_id
        )
        .execute(&mut *tx)
        .await?;

        for entry in entries {
            let id = Uuid::new_v4();
            sqlx::query!(
                r#"INSERT INTO project_repos (id, project_id, repo_id, uat_branch)
                   VALUES ($1, $2, $3, $4)"#,
                id,
                project_id,
                entry.repo_id,
                entry.uat_branch,
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
}
