use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::project_repo::CreateProjectRepo;

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Project not found")]
    ProjectNotFound,
    #[error("Failed to create project: {0}")]
    CreateFailed(String),
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub default_agent_working_dir: Option<String>,
    pub remote_project_id: Option<Uuid>,
    pub working_directory: Option<String>,
    pub auto_run_enabled: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProject {
    pub name: String,
    pub repositories: Vec<CreateProjectRepo>,
    pub working_directory: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProject {
    #[ts(optional)]
    pub name: Option<String>,
    #[ts(optional)]
    pub auto_run_enabled: Option<bool>,
}

#[derive(Debug, Serialize, TS)]
pub struct SearchResult {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
    /// Ranking score based on git history (higher = more recently/frequently edited)
    #[serde(default)]
    pub score: i64,
}

#[derive(Debug, Clone, Serialize, TS)]
pub enum SearchMatchType {
    FileName,
    DirectoryName,
    FullPath,
}

impl Project {
    /// Returns true if this project is a directory-only project (no git repos).
    pub fn is_directory_only(&self) -> bool {
        self.working_directory.is_some()
    }

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
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      working_directory,
                      auto_run_enabled as "auto_run_enabled!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
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
            SELECT p.id as "id!: Uuid", p.name,
                   p.default_agent_working_dir,
                   p.remote_project_id as "remote_project_id: Uuid",
                   p.working_directory,
                   p.auto_run_enabled as "auto_run_enabled!: bool",
                   p.created_at as "created_at!: DateTime<Utc>", p.updated_at as "updated_at!: DateTime<Utc>"
            FROM projects p
            WHERE p.id IN (
                SELECT DISTINCT t.project_id
                FROM tasks t
                INNER JOIN workspaces w ON w.task_id = t.id
                ORDER BY w.updated_at DESC
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
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      working_directory,
                      auto_run_enabled as "auto_run_enabled!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      working_directory,
                      auto_run_enabled as "auto_run_enabled!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE rowid = $1"#,
            rowid
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
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      working_directory,
                      auto_run_enabled as "auto_run_enabled!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE remote_project_id = $1
               LIMIT 1"#,
            remote_project_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        executor: impl Executor<'_, Database = Sqlite>,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name,
                    working_directory
                ) VALUES (
                    $1, $2, $3
                )
                RETURNING id as "id!: Uuid",
                          name,
                          default_agent_working_dir,
                          remote_project_id as "remote_project_id: Uuid",
                          working_directory,
                          auto_run_enabled as "auto_run_enabled!: bool",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
            data.working_directory,
        )
        .fetch_one(executor)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        payload: &UpdateProject,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = payload.name.clone().unwrap_or(existing.name);
        let auto_run_enabled = payload
            .auto_run_enabled
            .unwrap_or(existing.auto_run_enabled);

        sqlx::query_as!(
            Project,
            r#"UPDATE projects
               SET name = $2, auto_run_enabled = $3
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         default_agent_working_dir,
                         remote_project_id as "remote_project_id: Uuid",
                         working_directory,
                         auto_run_enabled as "auto_run_enabled!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            auto_run_enabled,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn make_project(working_directory: Option<String>) -> Project {
        Project {
            id: Uuid::new_v4(),
            name: "test".to_string(),
            default_agent_working_dir: None,
            remote_project_id: None,
            working_directory,
            auto_run_enabled: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_is_directory_only_with_working_directory() {
        let project = make_project(Some("/tmp/my-dir".to_string()));
        assert!(project.is_directory_only());
    }

    #[test]
    fn test_is_directory_only_without_working_directory() {
        let project = make_project(None);
        assert!(!project.is_directory_only());
    }
}
