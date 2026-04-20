use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum KanbanIssuePriority {
    Urgent,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanIssue {
    pub id: Uuid,
    pub project_id: Uuid,
    #[ts(type = "number")]
    pub issue_number: i64,
    pub simple_id: String,
    pub status_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<KanbanIssuePriority>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    #[ts(type = "number")]
    pub sort_order: i64,
    pub parent_issue_id: Option<Uuid>,
    #[ts(type = "number | null")]
    pub parent_issue_sort_order: Option<i64>,
    #[ts(type = "Record<string, unknown>")]
    pub extension_metadata: JsonValue,
    pub creator_user_id: Option<String>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanIssue {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub status_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<KanbanIssuePriority>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    #[ts(type = "number | null")]
    pub sort_order: Option<i64>,
    pub parent_issue_id: Option<Uuid>,
    #[ts(type = "number | null")]
    pub parent_issue_sort_order: Option<i64>,
    pub extension_metadata: Option<JsonValue>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateKanbanIssue {
    pub status_id: Option<Uuid>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<KanbanIssuePriority>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub completed_at: Option<String>,
    #[ts(type = "number | null")]
    pub sort_order: Option<i64>,
    pub parent_issue_id: Option<Uuid>,
    #[ts(type = "number | null")]
    pub parent_issue_sort_order: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct BulkUpdateKanbanIssueItem {
    pub id: Uuid,
    pub status_id: Option<Uuid>,
    #[ts(type = "number | null")]
    pub sort_order: Option<i64>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<KanbanIssuePriority>,
}

impl KanbanIssue {
    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanIssue,
            r#"SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                issue_number,
                simple_id,
                status_id AS "status_id!: Uuid",
                title,
                description,
                priority AS "priority: KanbanIssuePriority",
                start_date,
                target_date,
                completed_at,
                sort_order,
                parent_issue_id AS "parent_issue_id: Uuid",
                parent_issue_sort_order,
                extension_metadata AS "extension_metadata!: JsonValue",
                creator_user_id,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
               FROM kanban_issues
               WHERE project_id = $1
               ORDER BY sort_order ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanIssue,
            r#"SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                issue_number,
                simple_id,
                status_id AS "status_id!: Uuid",
                title,
                description,
                priority AS "priority: KanbanIssuePriority",
                start_date,
                target_date,
                completed_at,
                sort_order,
                parent_issue_id AS "parent_issue_id: Uuid",
                parent_issue_sort_order,
                extension_metadata AS "extension_metadata!: JsonValue",
                creator_user_id,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
               FROM kanban_issues
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateKanbanIssue) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);

        // Auto-increment issue_number per project
        let issue_number: i64 = sqlx::query_scalar!(
            r#"SELECT COALESCE(MAX(issue_number), 0) + 1 AS "num!: i64" FROM kanban_issues WHERE project_id = $1"#,
            data.project_id
        )
        .fetch_one(pool)
        .await?;

        let simple_id = format!("VK-{}", issue_number);
        let sort_order = data.sort_order.unwrap_or(issue_number * 1000);
        let ext_meta = data
            .extension_metadata
            .clone()
            .unwrap_or(JsonValue::Object(Default::default()));
        let ext_meta_str = serde_json::to_string(&ext_meta).unwrap_or_else(|_| "{}".to_string());

        sqlx::query!(
            r#"INSERT INTO kanban_issues
                (id, project_id, issue_number, simple_id, status_id, title, description,
                 priority, start_date, target_date, completed_at, sort_order,
                 parent_issue_id, parent_issue_sort_order, extension_metadata, creator_user_id)
               VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)"#,
            id,
            data.project_id,
            issue_number,
            simple_id,
            data.status_id,
            data.title,
            data.description,
            data.priority,
            data.start_date,
            data.target_date,
            data.completed_at,
            sort_order,
            data.parent_issue_id,
            data.parent_issue_sort_order,
            ext_meta_str,
            Option::<String>::None,
        )
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateKanbanIssue,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query!(
            r#"UPDATE kanban_issues
               SET status_id              = COALESCE($2, status_id),
                   title                  = COALESCE($3, title),
                   description            = COALESCE($4, description),
                   priority               = COALESCE($5, priority),
                   start_date             = COALESCE($6, start_date),
                   target_date            = COALESCE($7, target_date),
                   completed_at           = COALESCE($8, completed_at),
                   sort_order             = COALESCE($9, sort_order),
                   parent_issue_id        = COALESCE($10, parent_issue_id),
                   parent_issue_sort_order = COALESCE($11, parent_issue_sort_order),
                   updated_at             = datetime('now', 'subsec')
               WHERE id = $1"#,
            id,
            data.status_id,
            data.title,
            data.description,
            data.priority,
            data.start_date,
            data.target_date,
            data.completed_at,
            data.sort_order,
            data.parent_issue_id,
            data.parent_issue_sort_order,
        )
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn bulk_update(
        pool: &SqlitePool,
        items: &[BulkUpdateKanbanIssueItem],
    ) -> Result<(), sqlx::Error> {
        for item in items {
            sqlx::query!(
                r#"UPDATE kanban_issues
                   SET status_id  = COALESCE($2, status_id),
                       sort_order = COALESCE($3, sort_order),
                       title      = COALESCE($4, title),
                       description= COALESCE($5, description),
                       priority   = COALESCE($6, priority),
                       updated_at = datetime('now', 'subsec')
                   WHERE id = $1"#,
                item.id,
                item.status_id,
                item.sort_order,
                item.title,
                item.description,
                item.priority,
            )
            .execute(pool)
            .await?;
        }
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_issues WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
