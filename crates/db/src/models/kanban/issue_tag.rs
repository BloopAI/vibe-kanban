use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanIssueTag {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub tag_id: Uuid,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanIssueTag {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub tag_id: Uuid,
}

impl KanbanIssueTag {
    pub async fn find_by_issue(
        pool: &SqlitePool,
        issue_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanIssueTag,
            r#"SELECT
                id AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                tag_id AS "tag_id!: Uuid"
               FROM kanban_issue_tags
               WHERE issue_id = $1"#,
            issue_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanIssueTag,
            r#"SELECT
                kit.id AS "id!: Uuid",
                kit.issue_id AS "issue_id!: Uuid",
                kit.tag_id AS "tag_id!: Uuid"
               FROM kanban_issue_tags kit
               JOIN kanban_issues ki ON ki.id = kit.issue_id
               WHERE ki.project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateKanbanIssueTag,
    ) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query!(
            r#"INSERT OR IGNORE INTO kanban_issue_tags (id, issue_id, tag_id)
               VALUES ($1, $2, $3)"#,
            id,
            data.issue_id,
            data.tag_id,
        )
        .execute(pool)
        .await?;

        sqlx::query_as!(
            KanbanIssueTag,
            r#"SELECT
                id AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                tag_id AS "tag_id!: Uuid"
               FROM kanban_issue_tags
               WHERE issue_id = $1 AND tag_id = $2"#,
            data.issue_id,
            data.tag_id,
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_issue_tags WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
