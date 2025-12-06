use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Project not found")]
    ProjectNotFound,
    #[error("Project with git repository path already exists")]
    GitRepoPathExists,
    #[error("Failed to check existing git repository path: {0}")]
    GitRepoCheckFailed(String),
    #[error("Failed to create project: {0}")]
    CreateFailed(String),
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub git_repo_path: PathBuf,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub remote_project_id: Option<Uuid>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
    // Remote project fields (Phase 1F)
    pub is_remote: bool,
    pub source_node_id: Option<Uuid>,
    pub source_node_name: Option<String>,
    pub source_node_public_url: Option<String>,
    pub source_node_status: Option<String>,
    #[ts(type = "Date | null")]
    pub remote_last_synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateProject {
    pub name: String,
    pub git_repo_path: String,
    pub use_existing_repo: bool,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub git_repo_path: Option<String>,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct SearchResult {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub enum SearchMatchType {
    FileName,
    DirectoryName,
    FullPath,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ProjectConfigSuggestion {
    pub field: ProjectConfigField,
    pub value: String,
    pub confidence: ConfidenceLevel,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone, PartialEq)]
#[ts(export)]
pub enum ProjectConfigField {
    SetupScript,
    DevScript,
    CleanupScript,
    CopyFiles,
    DevHost,
    DevPort,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub enum ConfidenceLevel {
    High,
    Medium,
}

#[derive(Debug, Deserialize, TS)]
pub struct ScanConfigRequest {
    pub repo_path: String,
}

#[derive(Debug, Serialize, TS)]
pub struct ScanConfigResponse {
    pub suggestions: Vec<ProjectConfigSuggestion>,
}

impl Project {
    pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM projects"#)
            .fetch_one(pool)
            .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find the most actively used projects based on recent task activity
    pub async fn find_most_active(pool: &SqlitePool, limit: i32) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT p.id as "id!: Uuid", p.name, p.git_repo_path, p.setup_script, p.dev_script, p.cleanup_script, p.copy_files,
                   p.remote_project_id as "remote_project_id: Uuid",
                   p.created_at as "created_at!: DateTime<Utc>", p.updated_at as "updated_at!: DateTime<Utc>",
                   p.is_remote as "is_remote!: bool",
                   p.source_node_id as "source_node_id: Uuid",
                   p.source_node_name, p.source_node_public_url, p.source_node_status,
                   p.remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
            FROM projects p
            WHERE p.id IN (
                SELECT DISTINCT t.project_id
                FROM tasks t
                INNER JOIN task_attempts ta ON ta.task_id = t.id
                ORDER BY ta.updated_at DESC
            )
            LIMIT $1
            "#,
            limit
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_remote_project_id(
        pool: &SqlitePool,
        remote_project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE remote_project_id = $1
               LIMIT 1"#,
            remote_project_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_git_repo_path(
        pool: &SqlitePool,
        git_repo_path: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE git_repo_path = $1"#,
            git_repo_path
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_git_repo_path_excluding_id(
        pool: &SqlitePool,
        git_repo_path: &str,
        exclude_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE git_repo_path = $1 AND id != $2"#,
            git_repo_path,
            exclude_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name,
                    git_repo_path,
                    setup_script,
                    dev_script,
                    cleanup_script,
                    copy_files
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7
                )
                RETURNING id as "id!: Uuid",
                          name,
                          git_repo_path,
                          setup_script,
                          dev_script,
                          cleanup_script,
                          copy_files,
                          remote_project_id as "remote_project_id: Uuid",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>",
                          is_remote as "is_remote!: bool",
                          source_node_id as "source_node_id: Uuid",
                          source_node_name,
                          source_node_public_url,
                          source_node_status,
                          remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>""#,
            project_id,
            data.name,
            data.git_repo_path,
            data.setup_script,
            data.dev_script,
            data.cleanup_script,
            data.copy_files,
        )
        .fetch_one(pool)
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        name: String,
        git_repo_path: String,
        setup_script: Option<String>,
        dev_script: Option<String>,
        cleanup_script: Option<String>,
        copy_files: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"UPDATE projects
               SET name = $2,
                   git_repo_path = $3,
                   setup_script = $4,
                   dev_script = $5,
                   cleanup_script = $6,
                   copy_files = $7
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         git_repo_path,
                         setup_script,
                         dev_script,
                         cleanup_script,
                         copy_files,
                         remote_project_id as "remote_project_id: Uuid",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>",
                         is_remote as "is_remote!: bool",
                         source_node_id as "source_node_id: Uuid",
                         source_node_name,
                         source_node_public_url,
                         source_node_status,
                         remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>""#,
            id,
            name,
            git_repo_path,
            setup_script,
            dev_script,
            cleanup_script,
            copy_files,
        )
        .fetch_one(pool)
        .await
    }

    pub async fn set_remote_project_id(
        pool: &SqlitePool,
        id: Uuid,
        remote_project_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2
               WHERE id = $1"#,
            id,
            remote_project_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Transaction-compatible version of set_remote_project_id
    pub async fn set_remote_project_id_tx<'e, E>(
        executor: E,
        id: Uuid,
        remote_project_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2
               WHERE id = $1"#,
            id,
            remote_project_id
        )
        .execute(executor)
        .await?;

        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn exists(pool: &SqlitePool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"
                SELECT COUNT(*) as "count!: i64"
                FROM projects
                WHERE id = $1
            "#,
            id
        )
        .fetch_one(pool)
        .await?;

        Ok(result.count > 0)
    }

    /// Find all remote projects (synced from other nodes via the Hive)
    pub async fn find_remote_projects(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE is_remote = 1
               ORDER BY name"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find all local projects (created on this node)
    pub async fn find_local_projects(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE is_remote = 0
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Create or update a remote project synced from the Hive
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_remote_project(
        pool: &SqlitePool,
        local_id: Uuid,
        remote_project_id: Uuid,
        name: String,
        git_repo_path: String,
        source_node_id: Uuid,
        source_node_name: String,
        source_node_public_url: Option<String>,
        source_node_status: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name,
                    git_repo_path,
                    remote_project_id,
                    is_remote,
                    source_node_id,
                    source_node_name,
                    source_node_public_url,
                    source_node_status,
                    remote_last_synced_at
                ) VALUES (
                    $1, $2, $3, $4, 1, $5, $6, $7, $8, $9
                )
                ON CONFLICT(remote_project_id) WHERE remote_project_id IS NOT NULL DO UPDATE SET
                    name = excluded.name,
                    git_repo_path = excluded.git_repo_path,
                    source_node_name = excluded.source_node_name,
                    source_node_public_url = excluded.source_node_public_url,
                    source_node_status = excluded.source_node_status,
                    remote_last_synced_at = excluded.remote_last_synced_at,
                    updated_at = datetime('now', 'subsec')
                RETURNING id as "id!: Uuid",
                          name,
                          git_repo_path,
                          setup_script,
                          dev_script,
                          cleanup_script,
                          copy_files,
                          remote_project_id as "remote_project_id: Uuid",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>",
                          is_remote as "is_remote!: bool",
                          source_node_id as "source_node_id: Uuid",
                          source_node_name,
                          source_node_public_url,
                          source_node_status,
                          remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>""#,
            local_id,
            name,
            git_repo_path,
            remote_project_id,
            source_node_id,
            source_node_name,
            source_node_public_url,
            source_node_status,
            now
        )
        .fetch_one(pool)
        .await
    }

    /// Update the sync status for a remote project
    pub async fn update_remote_sync_status(
        pool: &SqlitePool,
        id: Uuid,
        source_node_status: Option<String>,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE projects
               SET source_node_status = $2,
                   remote_last_synced_at = $3
               WHERE id = $1"#,
            id,
            source_node_status,
            now
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Delete remote projects that are no longer in the Hive
    pub async fn delete_stale_remote_projects(
        pool: &SqlitePool,
        active_remote_project_ids: &[Uuid],
    ) -> Result<u64, sqlx::Error> {
        // If the list is empty, don't delete anything (safety check)
        if active_remote_project_ids.is_empty() {
            return Ok(0);
        }

        // SQLite doesn't have array parameters, so we need to build the query dynamically
        // However, sqlx doesn't support dynamic IN clauses easily.
        // For now, we'll use a simpler approach: fetch all remote projects and delete ones not in list
        let all_remote = Self::find_remote_projects(pool).await?;
        let mut deleted = 0u64;

        for project in all_remote {
            if let Some(remote_id) = project.remote_project_id
                && !active_remote_project_ids.contains(&remote_id)
            {
                deleted += Self::delete(pool, project.id).await?;
            }
        }

        Ok(deleted)
    }

    /// Get all remote_project_ids from local projects (for exclusion during remote sync)
    ///
    /// This returns the set of project IDs that are already linked to local projects,
    /// so they should be excluded from the remote project list.
    pub async fn find_local_project_remote_ids(
        pool: &SqlitePool,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT remote_project_id as "remote_project_id: Uuid"
               FROM projects
               WHERE is_remote = 0 AND remote_project_id IS NOT NULL"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().flatten().collect())
    }
}
