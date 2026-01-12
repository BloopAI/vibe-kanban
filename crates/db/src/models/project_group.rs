use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectGroup {
    pub id: Uuid,
    pub name: String,
    pub position: i32,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateProjectGroup {
    pub name: String,
    pub position: Option<i32>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProjectGroup {
    pub name: Option<String>,
    pub position: Option<i32>,
}

impl ProjectGroup {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectGroup,
            r#"SELECT id as "id!: Uuid",
                      name,
                      position as "position: i32",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_groups
               ORDER BY position ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectGroup,
            r#"SELECT id as "id!: Uuid",
                      name,
                      position as "position: i32",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_groups
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectGroup,
            r#"SELECT id as "id!: Uuid",
                      name,
                      position as "position: i32",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_groups
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateProjectGroup) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let position = data.position.unwrap_or(0);
        sqlx::query_as!(
            ProjectGroup,
            r#"INSERT INTO project_groups (id, name, position)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         name,
                         position as "position: i32",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.name,
            position
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateProjectGroup,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let position = data.position.unwrap_or(existing.position);

        sqlx::query_as!(
            ProjectGroup,
            r#"UPDATE project_groups
               SET name = $2, position = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         position as "position: i32",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            position
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM project_groups WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
