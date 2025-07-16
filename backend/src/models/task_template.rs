use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskTemplate {
    pub id: Uuid,
    pub project_id: Option<Uuid>, // None for global templates
    pub title: String,
    pub description: Option<String>,
    pub template_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTaskTemplate {
    pub project_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub template_name: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTaskTemplate {
    pub title: Option<String>,
    pub description: Option<String>,
    pub template_name: Option<String>,
}

impl TaskTemplate {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplate,
            r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", title, description, template_name, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_templates 
               ORDER BY project_id IS NULL DESC, template_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if let Some(pid) = project_id {
            // Return only project-specific templates
            sqlx::query_as::<_, TaskTemplate>(
                r#"SELECT id, project_id, title, description, template_name, created_at, updated_at
                   FROM task_templates 
                   WHERE project_id = ?
                   ORDER BY template_name ASC"#,
            )
            .bind(pid)
            .fetch_all(pool)
            .await
        } else {
            // Return only global templates
            sqlx::query_as!(
                TaskTemplate,
                r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", title, description, template_name, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_templates 
                   WHERE project_id IS NULL
                   ORDER BY template_name ASC"#
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplate,
            r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", title, description, template_name, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_templates 
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateTaskTemplate) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            TaskTemplate,
            r#"INSERT INTO task_templates (id, project_id, title, description, template_name) 
               VALUES ($1, $2, $3, $4, $5) 
               RETURNING id as "id!: Uuid", project_id as "project_id?: Uuid", title, description, template_name, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.title,
            data.description,
            data.template_name
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskTemplate,
    ) -> Result<Self, sqlx::Error> {
        // Get existing template first
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Use let bindings to create longer-lived values
        let title = data.title.as_ref().unwrap_or(&existing.title);
        let description = data.description.as_ref().or(existing.description.as_ref());
        let template_name = data
            .template_name
            .as_ref()
            .unwrap_or(&existing.template_name);

        sqlx::query_as!(
            TaskTemplate,
            r#"UPDATE task_templates 
               SET title = $2, description = $3, template_name = $4, updated_at = datetime('now', 'subsec')
               WHERE id = $1 
               RETURNING id as "id!: Uuid", project_id as "project_id?: Uuid", title, description, template_name, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            title,
            description,
            template_name
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_templates WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
