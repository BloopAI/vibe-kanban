use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanIssueAssignee {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub user_id: String,
    #[ts(type = "string")]
    pub assigned_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanIssueAssignee {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub user_id: String,
}

impl KanbanIssueAssignee {
    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanIssueAssignee,
            r#"SELECT
                kia.id AS "id!: Uuid",
                kia.issue_id AS "issue_id!: Uuid",
                kia.user_id,
                kia.assigned_at AS "assigned_at!: DateTime<Utc>"
               FROM kanban_issue_assignees kia
               JOIN kanban_issues ki ON ki.id = kia.issue_id
               WHERE ki.project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateKanbanIssueAssignee,
    ) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query!(
            r#"INSERT OR IGNORE INTO kanban_issue_assignees (id, issue_id, user_id)
               VALUES ($1, $2, $3)"#,
            id,
            data.issue_id,
            data.user_id,
        )
        .execute(pool)
        .await?;

        sqlx::query_as!(
            KanbanIssueAssignee,
            r#"SELECT
                id AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                user_id,
                assigned_at AS "assigned_at!: DateTime<Utc>"
               FROM kanban_issue_assignees
               WHERE issue_id = $1 AND user_id = $2"#,
            data.issue_id,
            data.user_id,
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_issue_assignees WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
