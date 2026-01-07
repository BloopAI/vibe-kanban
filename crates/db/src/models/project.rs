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
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub remote_project_id: Option<Uuid>,
    /// None = usa config global, Some(true/false) = override por proyecto
    pub git_auto_commit_enabled: Option<bool>,
    /// None = usa config global, Some(mode) = override por proyecto
    /// valores: "AgentSummary", "AiGenerated", "Manual"
    pub git_commit_title_mode: Option<String>,
    /// None = usa config global, Some(true/false) = override por proyecto
    pub auto_pr_on_review_enabled: Option<bool>,
    /// None = usa config global, Some(true/false) = override por proyecto
    pub auto_pr_draft: Option<bool>,
    /// None = usa config global, Some(true/false) = override por proyecto
    pub redirect_to_attempt_on_create: Option<bool>,
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
    /// None = no cambia, Some(None) = usa config global, Some(Some(v)) = override
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    #[ts(optional, type = "boolean | null")]
    pub git_auto_commit_enabled: Option<Option<bool>>,
    /// None = no cambia, Some(None) = usa config global, Some(Some(mode)) = override
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    #[ts(optional, type = "string | null")]
    pub git_commit_title_mode: Option<Option<String>>,
    /// None = no cambia, Some(None) = usa config global, Some(Some(v)) = override
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    #[ts(optional, type = "boolean | null")]
    pub auto_pr_on_review_enabled: Option<Option<bool>>,
    /// None = no cambia, Some(None) = usa config global, Some(Some(v)) = override
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    #[ts(optional, type = "boolean | null")]
    pub auto_pr_draft: Option<Option<bool>>,
    /// None = no cambia, Some(None) = usa config global, Some(Some(v)) = override
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    #[ts(optional, type = "boolean | null")]
    pub redirect_to_attempt_on_create: Option<Option<bool>>,
}

/// deserializa campos que pueden ser undefined (ausente), null, o un valor
fn deserialize_optional_nullable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    // si el campo está presente, deserializa Option<T>
    Option::<Option<T>>::deserialize(deserializer)
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
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                      git_commit_title_mode,
                      auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                      auto_pr_draft as "auto_pr_draft: bool",
                      redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
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
            SELECT p.id as "id!: Uuid", p.name, p.dev_script, p.dev_script_working_dir,
                   p.default_agent_working_dir,
                   p.remote_project_id as "remote_project_id: Uuid",
                   p.git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                   p.git_commit_title_mode,
                   p.auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                   p.auto_pr_draft as "auto_pr_draft: bool",
                   p.redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
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
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                      git_commit_title_mode,
                      auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                      auto_pr_draft as "auto_pr_draft: bool",
                      redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
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
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                      git_commit_title_mode,
                      auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                      auto_pr_draft as "auto_pr_draft: bool",
                      redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
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
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                      git_commit_title_mode,
                      auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                      auto_pr_draft as "auto_pr_draft: bool",
                      redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
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
                          git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                          git_commit_title_mode,
                          auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                          auto_pr_draft as "auto_pr_draft: bool",
                          redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
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
        let dev_script = payload.dev_script.clone();
        let dev_script_working_dir = payload.dev_script_working_dir.clone();
        let default_agent_working_dir = payload.default_agent_working_dir.clone();
        // si el campo está ausente (None externo), mantener el valor existente
        let git_auto_commit_enabled = payload
            .git_auto_commit_enabled
            .unwrap_or(existing.git_auto_commit_enabled);
        let git_commit_title_mode = payload
            .git_commit_title_mode
            .clone()
            .unwrap_or(existing.git_commit_title_mode);
        let auto_pr_on_review_enabled = payload
            .auto_pr_on_review_enabled
            .unwrap_or(existing.auto_pr_on_review_enabled);
        let auto_pr_draft = payload
            .auto_pr_draft
            .unwrap_or(existing.auto_pr_draft);
        let redirect_to_attempt_on_create = payload
            .redirect_to_attempt_on_create
            .unwrap_or(existing.redirect_to_attempt_on_create);

        sqlx::query_as!(
            Project,
            r#"UPDATE projects
               SET name = $2, dev_script = $3, dev_script_working_dir = $4, default_agent_working_dir = $5,
                   git_auto_commit_enabled = $6, git_commit_title_mode = $7, auto_pr_on_review_enabled = $8, auto_pr_draft = $9, redirect_to_attempt_on_create = $10
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         dev_script,
                         dev_script_working_dir,
                         default_agent_working_dir,
                         remote_project_id as "remote_project_id: Uuid",
                         git_auto_commit_enabled as "git_auto_commit_enabled: bool",
                         git_commit_title_mode,
                         auto_pr_on_review_enabled as "auto_pr_on_review_enabled: bool",
                         auto_pr_draft as "auto_pr_draft: bool",
                         redirect_to_attempt_on_create as "redirect_to_attempt_on_create: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            dev_script,
            dev_script_working_dir,
            default_agent_working_dir,
            git_auto_commit_enabled,
            git_commit_title_mode,
            auto_pr_on_review_enabled,
            auto_pr_draft,
            redirect_to_attempt_on_create,
        )
        .fetch_one(pool)
        .await
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
