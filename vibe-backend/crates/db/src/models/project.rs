use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Postgres, PgPool};
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

/// Project status options
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Backlog,
    Planned,
    InProgress,
    Paused,
    Completed,
    Cancelled,
}

impl Default for ProjectStatus {
    fn default() -> Self {
        Self::Backlog
    }
}

impl std::fmt::Display for ProjectStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Backlog => write!(f, "backlog"),
            Self::Planned => write!(f, "planned"),
            Self::InProgress => write!(f, "in_progress"),
            Self::Paused => write!(f, "paused"),
            Self::Completed => write!(f, "completed"),
            Self::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl From<Option<String>> for ProjectStatus {
    fn from(s: Option<String>) -> Self {
        match s.as_deref() {
            Some("backlog") => Self::Backlog,
            Some("planned") => Self::Planned,
            Some("in_progress") => Self::InProgress,
            Some("paused") => Self::Paused,
            Some("completed") => Self::Completed,
            Some("cancelled") => Self::Cancelled,
            _ => Self::Backlog,
        }
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub remote_project_id: Option<Uuid>,
    /// Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
    pub priority: Option<i32>,
    pub lead_id: Option<Uuid>,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub status: Option<String>,
    /// Health percentage 0-100
    pub health: Option<i32>,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub icon: Option<String>,
    /// The tenant workspace this project belongs to (for multi-tenant scoping)
    pub tenant_workspace_id: Option<Uuid>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProject {
    pub name: String,
    pub repositories: Vec<CreateProjectRepo>,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub lead_id: Option<Uuid>,
    #[serde(default)]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub target_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    /// The tenant workspace this project belongs to
    #[serde(default)]
    pub tenant_workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub dev_script: Option<String>,
    pub dev_script_working_dir: Option<String>,
    pub default_agent_working_dir: Option<String>,
    pub priority: Option<i32>,
    pub lead_id: Option<Uuid>,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub status: Option<String>,
    pub health: Option<i32>,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub icon: Option<String>,
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
    pub async fn count(pool: &PgPool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM projects"#)
            .fetch_one(pool)
            .await
    }

    pub async fn find_all(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      priority as "priority: i32",
                      lead_id as "lead_id: Uuid",
                      start_date,
                      target_date,
                      status,
                      health as "health: i32",
                      description,
                      summary,
                      icon,
                      tenant_workspace_id as "tenant_workspace_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find all projects belonging to a specific tenant workspace
    pub async fn find_by_workspace(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      priority as "priority: i32",
                      lead_id as "lead_id: Uuid",
                      start_date,
                      target_date,
                      status,
                      health as "health: i32",
                      description,
                      summary,
                      icon,
                      tenant_workspace_id as "tenant_workspace_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE tenant_workspace_id = $1
               ORDER BY created_at DESC"#,
            workspace_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find all projects, optionally filtered by workspace
    /// If workspace_id is None, returns all projects (for backwards compatibility)
    pub async fn find_all_with_workspace_filter(
        pool: &PgPool,
        workspace_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        match workspace_id {
            Some(ws_id) => Self::find_by_workspace(pool, ws_id).await,
            None => Self::find_all(pool).await,
        }
    }

    /// Find the most actively used projects based on recent task activity
    pub async fn find_most_active(pool: &PgPool, limit: i32) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT p.id as "id!: Uuid", p.name, p.dev_script, p.dev_script_working_dir,
                   p.default_agent_working_dir,
                   p.remote_project_id as "remote_project_id: Uuid",
                   p.priority as "priority: i32",
                   p.lead_id as "lead_id: Uuid",
                   p.start_date,
                   p.target_date,
                   p.status,
                   p.health as "health: i32",
                   p.description,
                   p.summary,
                   p.icon,
                   p.tenant_workspace_id as "tenant_workspace_id: Uuid",
                   p.created_at as "created_at!: DateTime<Utc>", p.updated_at as "updated_at!: DateTime<Utc>"
            FROM projects p
            WHERE p.id IN (
                SELECT t.project_id
                FROM tasks t
                INNER JOIN workspaces w ON w.task_id = t.id
                GROUP BY t.project_id
                ORDER BY MAX(w.updated_at) DESC
            )
            LIMIT $1
            "#,
            limit as i64 // LIMIT in Postgres often wants i64 or generic int
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      dev_script,
                      dev_script_working_dir,
                      default_agent_working_dir,
                      remote_project_id as "remote_project_id: Uuid",
                      priority as "priority: i32",
                      lead_id as "lead_id: Uuid",
                      start_date,
                      target_date,
                      status,
                      health as "health: i32",
                      description,
                      summary,
                      icon,
                      tenant_workspace_id as "tenant_workspace_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_remote_project_id(
        pool: &PgPool,
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
                      priority as "priority: i32",
                      lead_id as "lead_id: Uuid",
                      start_date,
                      target_date,
                      status,
                      health as "health: i32",
                      description,
                      summary,
                      icon,
                      tenant_workspace_id as "tenant_workspace_id: Uuid",
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
        executor: impl Executor<'_, Database = Postgres>,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name,
                    priority,
                    lead_id,
                    start_date,
                    target_date,
                    status,
                    description,
                    summary,
                    icon,
                    tenant_workspace_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
                )
                RETURNING id as "id!: Uuid",
                          name,
                          dev_script,
                          dev_script_working_dir,
                          default_agent_working_dir,
                          remote_project_id as "remote_project_id: Uuid",
                          priority as "priority: i32",
                          lead_id as "lead_id: Uuid",
                          start_date as "start_date: DateTime<Utc>",
                          target_date as "target_date: DateTime<Utc>",
                          status,
                          health as "health: i32",
                          description,
                          summary,
                          icon,
                          tenant_workspace_id as "tenant_workspace_id: Uuid",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
            data.priority,
            data.lead_id,
            data.start_date,
            data.target_date,
            data.status,
            data.description,
            data.summary,
            data.icon,
            data.tenant_workspace_id,
        )
        .fetch_one(executor)
        .await
    }

    pub async fn update(
        pool: &PgPool,
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
        let priority = payload.priority.or(existing.priority);
        let lead_id = payload.lead_id.or(existing.lead_id);
        let start_date = payload.start_date.clone().or(existing.start_date);
        let target_date = payload.target_date.clone().or(existing.target_date);
        let status = payload.status.clone().or(existing.status);
        let health = payload.health.or(existing.health);
        let description = payload.description.clone().or(existing.description);
        let summary = payload.summary.clone().or(existing.summary);
        let icon = payload.icon.clone().or(existing.icon);

        sqlx::query_as!(
            Project,
            r#"UPDATE projects
               SET name = $2, dev_script = $3, dev_script_working_dir = $4, default_agent_working_dir = $5,
                   priority = $6, lead_id = $7, start_date = $8, target_date = $9, status = $10,
                   health = $11, description = $12, summary = $13, icon = $14,
                   updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         dev_script,
                         dev_script_working_dir,
                         default_agent_working_dir,
                         remote_project_id as "remote_project_id: Uuid",
                         priority as "priority: i32",
                         lead_id as "lead_id: Uuid",
                         start_date,
                         target_date,
                         status,
                         health as "health: i32",
                         description,
                         summary,
                         icon,
                         tenant_workspace_id as "tenant_workspace_id: Uuid",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            dev_script,
            dev_script_working_dir,
            default_agent_working_dir,
            priority,
            lead_id,
            start_date,
            target_date,
            status,
            health,
            description,
            summary,
            icon,
        )
        .fetch_one(pool)
        .await
    }

    pub async fn clear_default_agent_working_dir(
        pool: &PgPool,
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
        pool: &PgPool,
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
        E: Executor<'e, Database = Postgres>,
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

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
