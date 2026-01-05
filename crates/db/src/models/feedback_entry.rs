use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "feedback_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum FeedbackType {
    #[default]
    Execution,
    Deploy,
    User,
    System,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct FeedbackEntry {
    pub id: Uuid,
    pub task_id: Option<Uuid>,
    pub discovery_item_id: Option<Uuid>,
    pub feedback_type: FeedbackType,
    pub content: String, // JSON structured content
    pub summary: Option<String>,
    pub source_execution_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateFeedbackEntry {
    pub task_id: Option<Uuid>,
    pub discovery_item_id: Option<Uuid>,
    pub feedback_type: FeedbackType,
    pub content: String,
    pub summary: Option<String>,
    pub source_execution_id: Option<Uuid>,
}

impl FeedbackEntry {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            FeedbackEntry,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id: Uuid",
                discovery_item_id as "discovery_item_id: Uuid",
                feedback_type as "feedback_type!: FeedbackType",
                content,
                summary,
                source_execution_id as "source_execution_id: Uuid",
                created_at as "created_at!: DateTime<Utc>"
            FROM feedback_entries
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
            FeedbackEntry,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id: Uuid",
                discovery_item_id as "discovery_item_id: Uuid",
                feedback_type as "feedback_type!: FeedbackType",
                content,
                summary,
                source_execution_id as "source_execution_id: Uuid",
                created_at as "created_at!: DateTime<Utc>"
            FROM feedback_entries
            WHERE task_id = $1
            ORDER BY created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_discovery_item_id(
        pool: &SqlitePool,
        discovery_item_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            FeedbackEntry,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id: Uuid",
                discovery_item_id as "discovery_item_id: Uuid",
                feedback_type as "feedback_type!: FeedbackType",
                content,
                summary,
                source_execution_id as "source_execution_id: Uuid",
                created_at as "created_at!: DateTime<Utc>"
            FROM feedback_entries
            WHERE discovery_item_id = $1
            ORDER BY created_at DESC"#,
            discovery_item_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find all feedback entries related to a task, including those from its discovery item
    pub async fn find_all_for_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            FeedbackEntry,
            r#"SELECT
                f.id as "id!: Uuid",
                f.task_id as "task_id: Uuid",
                f.discovery_item_id as "discovery_item_id: Uuid",
                f.feedback_type as "feedback_type!: FeedbackType",
                f.content,
                f.summary,
                f.source_execution_id as "source_execution_id: Uuid",
                f.created_at as "created_at!: DateTime<Utc>"
            FROM feedback_entries f
            LEFT JOIN discovery_items d ON f.discovery_item_id = d.id
            WHERE f.task_id = $1
               OR d.promoted_task_id = $1
            ORDER BY f.created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateFeedbackEntry,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            FeedbackEntry,
            r#"INSERT INTO feedback_entries (id, task_id, discovery_item_id, feedback_type, content, summary, source_execution_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id as "id!: Uuid",
                task_id as "task_id: Uuid",
                discovery_item_id as "discovery_item_id: Uuid",
                feedback_type as "feedback_type!: FeedbackType",
                content,
                summary,
                source_execution_id as "source_execution_id: Uuid",
                created_at as "created_at!: DateTime<Utc>""#,
            id,
            data.task_id,
            data.discovery_item_id,
            data.feedback_type,
            data.content,
            data.summary,
            data.source_execution_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM feedback_entries WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
