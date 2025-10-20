use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskTag {
    pub id: Uuid,
    pub tag_name: String,
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskTag {
    pub tag_name: String,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskTag {
    pub tag_name: Option<String>,
    pub content: Option<String>,
}

/// Validate tag name format
/// Rules: lowercase letters, numbers, underscores only
/// Must start with letter, be 2-50 characters long
fn validate_tag_name(name: &str) -> Result<(), String> {
    // Check length
    if name.len() < 2 {
        return Err("Tag name must be at least 2 characters long".to_string());
    }
    if name.len() > 50 {
        return Err("Tag name must be at most 50 characters long".to_string());
    }

    // Check format: lowercase letters, numbers, underscores
    // Must start with a letter
    let first_char = name.chars().next().unwrap();
    if !first_char.is_ascii_lowercase() {
        return Err("Tag name must start with a lowercase letter".to_string());
    }

    // Check all characters are valid
    for ch in name.chars() {
        if !ch.is_ascii_lowercase() && !ch.is_ascii_digit() && ch != '_' {
            return Err(
                "Tag name can only contain lowercase letters, numbers, and underscores".to_string(),
            );
        }
    }

    // Check for reserved words
    let reserved = ["all", "none", "undefined", "null", "true", "false"];
    if reserved.contains(&name) {
        return Err(format!(
            "'{name}' is a reserved word and cannot be used as a tag name"
        ));
    }

    Ok(())
}

impl TaskTag {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTag,
            r#"SELECT id as "id!: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_tags
               ORDER BY tag_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTag,
            r#"SELECT id as "id!: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_tags
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateTaskTag) -> Result<Self, sqlx::Error> {
        // Validate tag name format
        validate_tag_name(&data.tag_name).map_err(sqlx::Error::Protocol)?;

        let id = Uuid::new_v4();
        sqlx::query_as!(
            TaskTag,
            r#"INSERT INTO task_tags (id, tag_name, content)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.tag_name,
            data.content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskTag,
    ) -> Result<Self, sqlx::Error> {
        // Get existing tag first
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Use let bindings to create longer-lived values
        let tag_name = data.tag_name.as_ref().unwrap_or(&existing.tag_name);
        let content = data.content.as_ref().or(existing.content.as_ref());

        // Validate tag name format if it's being updated
        if data.tag_name.is_some() {
            validate_tag_name(tag_name).map_err(sqlx::Error::Protocol)?;
        }

        sqlx::query_as!(
            TaskTag,
            r#"UPDATE task_tags
               SET tag_name = $2, content = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            tag_name,
            content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_tags WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
