use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "discovery_item_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum DiscoveryItemType {
    #[default]
    Scenario,
    Spec,
    Story,
    Spike,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "discovery_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum DiscoveryStatus {
    #[default]
    Draft,
    Refining,
    Ready,
    Promoted,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct EffortEstimate {
    pub value: f32,
    pub unit: String, // "hours", "days", "points"
    pub confidence: String, // "low", "medium", "high"
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct DiscoveryItem {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub item_type: DiscoveryItemType,
    pub status: DiscoveryStatus,
    pub content: String,
    pub acceptance_criteria: Option<String>,
    #[sqlx(json)]
    pub effort_estimate: Option<String>, // JSON string, parsed client-side
    pub priority: Option<i64>,
    pub promoted_task_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateDiscoveryItem {
    pub project_id: Uuid,
    pub title: String,
    pub item_type: Option<DiscoveryItemType>,
    pub content: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub effort_estimate: Option<String>,
    pub priority: Option<i64>,
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpdateDiscoveryItem {
    pub title: Option<String>,
    pub item_type: Option<DiscoveryItemType>,
    pub status: Option<DiscoveryStatus>,
    pub content: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub effort_estimate: Option<String>,
    pub priority: Option<i64>,
    pub parent_id: Option<Uuid>,
}

impl DiscoveryItem {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            DiscoveryItem,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                title,
                item_type as "item_type!: DiscoveryItemType",
                status as "status!: DiscoveryStatus",
                content,
                acceptance_criteria,
                effort_estimate,
                priority,
                promoted_task_id as "promoted_task_id: Uuid",
                parent_id as "parent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM discovery_items
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            DiscoveryItem,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                title,
                item_type as "item_type!: DiscoveryItemType",
                status as "status!: DiscoveryStatus",
                content,
                acceptance_criteria,
                effort_estimate,
                priority,
                promoted_task_id as "promoted_task_id: Uuid",
                parent_id as "parent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM discovery_items
            WHERE project_id = $1
            ORDER BY
                CASE status
                    WHEN 'ready' THEN 1
                    WHEN 'refining' THEN 2
                    WHEN 'draft' THEN 3
                    WHEN 'promoted' THEN 4
                    WHEN 'archived' THEN 5
                END,
                priority DESC NULLS LAST,
                created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            DiscoveryItem,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                title,
                item_type as "item_type!: DiscoveryItemType",
                status as "status!: DiscoveryStatus",
                content,
                acceptance_criteria,
                effort_estimate,
                priority,
                promoted_task_id as "promoted_task_id: Uuid",
                parent_id as "parent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM discovery_items
            WHERE promoted_task_id = $1"#,
            task_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateDiscoveryItem,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let item_type = data.item_type.clone().unwrap_or_default();
        let content = data.content.clone().unwrap_or_default();

        sqlx::query_as!(
            DiscoveryItem,
            r#"INSERT INTO discovery_items (id, project_id, title, item_type, content, acceptance_criteria, effort_estimate, priority, parent_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                title,
                item_type as "item_type!: DiscoveryItemType",
                status as "status!: DiscoveryStatus",
                content,
                acceptance_criteria,
                effort_estimate,
                priority,
                promoted_task_id as "promoted_task_id: Uuid",
                parent_id as "parent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.title,
            item_type,
            content,
            data.acceptance_criteria,
            data.effort_estimate,
            data.priority,
            data.parent_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateDiscoveryItem,
    ) -> Result<Self, sqlx::Error> {
        // Fetch current to merge with updates
        let current = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let title = data.title.clone().unwrap_or(current.title);
        let item_type = data.item_type.clone().unwrap_or(current.item_type);
        let status = data.status.clone().unwrap_or(current.status);
        let content = data.content.clone().unwrap_or(current.content);
        let acceptance_criteria = data.acceptance_criteria.clone().or(current.acceptance_criteria);
        let effort_estimate = data.effort_estimate.clone().or(current.effort_estimate);
        let priority = data.priority.or(current.priority);
        let parent_id = data.parent_id.or(current.parent_id);

        sqlx::query_as!(
            DiscoveryItem,
            r#"UPDATE discovery_items
            SET title = $2, item_type = $3, status = $4, content = $5,
                acceptance_criteria = $6, effort_estimate = $7, priority = $8,
                parent_id = $9, updated_at = datetime('now', 'subsec')
            WHERE id = $1
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                title,
                item_type as "item_type!: DiscoveryItemType",
                status as "status!: DiscoveryStatus",
                content,
                acceptance_criteria,
                effort_estimate,
                priority,
                promoted_task_id as "promoted_task_id: Uuid",
                parent_id as "parent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            title,
            item_type,
            status,
            content,
            acceptance_criteria,
            effort_estimate,
            priority,
            parent_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn promote_to_task(
        pool: &SqlitePool,
        id: Uuid,
        task_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            DiscoveryItem,
            r#"UPDATE discovery_items
            SET status = 'promoted', promoted_task_id = $2, updated_at = datetime('now', 'subsec')
            WHERE id = $1
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                title,
                item_type as "item_type!: DiscoveryItemType",
                status as "status!: DiscoveryStatus",
                content,
                acceptance_criteria,
                effort_estimate,
                priority,
                promoted_task_id as "promoted_task_id: Uuid",
                parent_id as "parent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            task_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM discovery_items WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Build the full context string for agent execution
    pub fn to_context(&self) -> String {
        let mut context = format!("## {}\n\n", self.title);

        if !self.content.is_empty() {
            context.push_str(&self.content);
            context.push_str("\n\n");
        }

        if let Some(ref criteria) = self.acceptance_criteria {
            context.push_str("### Acceptance Criteria\n\n");
            context.push_str(criteria);
            context.push_str("\n\n");
        }

        context
    }
}
