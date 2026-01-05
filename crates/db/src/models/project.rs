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

/// Per-project editor configuration override.
/// When set, this overrides the global editor settings for this project.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectEditorConfig {
    pub editor_type: String,
    pub custom_command: Option<String>,
}

/// Internal representation for SQLx that stores editor_config as JSON string
#[derive(Debug, Clone, FromRow)]
struct ProjectRow {
    pub id: Uuid,
    pub name: String,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub remote_project_id: Option<Uuid>,
    pub editor_config: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<ProjectRow> for Project {
    fn from(row: ProjectRow) -> Self {
        let editor_config = row
            .editor_config
            .and_then(|s| serde_json::from_str(&s).ok());
        Project {
            id: row.id,
            name: row.name,
            dev_script: row.dev_script,
            dev_script_working_dir: row.dev_script_working_dir,
            default_agent_working_dir: row.default_agent_working_dir,
            remote_project_id: row.remote_project_id,
            editor_config,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub remote_project_id: Option<Uuid>,
    /// Per-project editor configuration override
    #[ts(optional)]
    pub editor_config: Option<ProjectEditorConfig>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProject {
    pub name: String,
    pub repositories: Vec<CreateProjectRepo>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    /// Per-project editor configuration override.
    /// Set to Some(config) to use a specific editor for this project.
    /// Set to None to clear the override and use global settings.
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    #[ts(optional)]
    pub editor_config: Option<Option<ProjectEditorConfig>>,
}

/// Custom deserializer that distinguishes between missing field (None) and null value (Some(None))
fn deserialize_optional_field<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    // This will be called only when the field is present in JSON
    // null -> Some(None), value -> Some(Some(value))
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize, TS)]
pub struct SearchResult {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
}

#[derive(Debug, Clone, Serialize, TS)]
pub enum SearchMatchType {
    FileName,
    DirectoryName,
    FullPath,
}

impl Project {
    pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM projects"#)
            .fetch_one(pool)
            .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            ProjectRow,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      editor_config,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Find the most actively used projects based on recent task activity
    pub async fn find_most_active(pool: &SqlitePool, limit: i32) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            ProjectRow,
            r#"
            SELECT p.id as "id!: Uuid", p.name, p.dev_script, p.dev_script_working_dir,
                   p.default_agent_working_dir,
                   p.remote_project_id as "remote_project_id: Uuid",
                   p.editor_config,
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
        .await?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            ProjectRow,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      editor_config,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;
        Ok(row.map(Into::into))
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            ProjectRow,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      editor_config,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await?;
        Ok(row.map(Into::into))
    }

    pub async fn find_by_remote_project_id(
        pool: &SqlitePool,
        remote_project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            ProjectRow,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      editor_config,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE remote_project_id = $1
               LIMIT 1"#,
            remote_project_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(row.map(Into::into))
    }

    pub async fn create(
        executor: impl Executor<'_, Database = Sqlite>,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            ProjectRow,
            r#"INSERT INTO projects (
                    id,
                    name
                ) VALUES (
                    $1, $2
                )
                RETURNING id as "id!: Uuid",
                          name,
                          dev_script,
                          dev_script_working_dir,
                          default_agent_working_dir,
                          remote_project_id as "remote_project_id: Uuid",
                          editor_config,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
        )
        .fetch_one(executor)
        .await?;
        Ok(row.into())
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
        let dev_script = payload.dev_script.clone();
        let dev_script_working_dir = payload.dev_script_working_dir.clone();
        let default_agent_working_dir = payload.default_agent_working_dir.clone();

        // Handle editor_config: if Some(value) is provided, update it; if not provided, keep existing
        let editor_config_json = match &payload.editor_config {
            Some(config) => config
                .as_ref()
                .and_then(|c| serde_json::to_string(c).ok()),
            None => existing
                .editor_config
                .and_then(|c| serde_json::to_string(&c).ok()),
        };

        let row = sqlx::query_as!(
            ProjectRow,
            r#"UPDATE projects
               SET name = $2, dev_script = $3, dev_script_working_dir = $4, default_agent_working_dir = $5, editor_config = $6
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         dev_script,
                         dev_script_working_dir,
                         default_agent_working_dir,
                         remote_project_id as "remote_project_id: Uuid",
                         editor_config,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            dev_script,
            dev_script_working_dir,
            default_agent_working_dir,
            editor_config_json,
        )
        .fetch_one(pool)
        .await?;
        Ok(row.into())
    }

    pub async fn clear_default_agent_working_dir(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET default_agent_working_dir = ''
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
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
