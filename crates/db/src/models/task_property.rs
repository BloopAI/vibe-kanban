use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "property_source", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum PropertySource {
    #[default]
    Vibe,
    Github,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskProperty {
    pub id: Uuid,
    pub task_id: Uuid,
    pub property_name: String,
    pub property_value: String, // JSON string
    pub source: PropertySource,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateTaskProperty {
    pub task_id: Uuid,
    pub property_name: String,
    pub property_value: String,
    pub source: Option<PropertySource>,
}

impl TaskProperty {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskProperty,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                property_name,
                property_value,
                source as "source!: PropertySource",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM task_properties
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskProperty,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                property_name,
                property_value,
                source as "source!: PropertySource",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM task_properties
            WHERE task_id = $1
            ORDER BY property_name ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_task_and_name(
        pool: &SqlitePool,
        task_id: Uuid,
        property_name: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskProperty,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                property_name,
                property_value,
                source as "source!: PropertySource",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM task_properties
            WHERE task_id = $1 AND property_name = $2"#,
            task_id,
            property_name
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn upsert(
        pool: &SqlitePool,
        data: &CreateTaskProperty,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let source = data.source.clone().unwrap_or_default();
        sqlx::query_as!(
            TaskProperty,
            r#"INSERT INTO task_properties (id, task_id, property_name, property_value, source)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(task_id, property_name) DO UPDATE SET
                property_value = excluded.property_value,
                source = excluded.source,
                updated_at = CURRENT_TIMESTAMP
            RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                property_name,
                property_value,
                source as "source!: PropertySource",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.task_id,
            data.property_name,
            data.property_value,
            source
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM task_properties WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_task_id<'e, E>(executor: E, task_id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM task_properties WHERE task_id = $1", task_id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
