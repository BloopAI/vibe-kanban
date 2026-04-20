use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum KanbanIssueRelationshipType {
    Blocking,
    Related,
    HasDuplicate,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanIssueRelationship {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub related_issue_id: Uuid,
    pub relationship_type: KanbanIssueRelationshipType,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanIssueRelationship {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub related_issue_id: Uuid,
    pub relationship_type: KanbanIssueRelationshipType,
}

impl KanbanIssueRelationship {
    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanIssueRelationship,
            r#"SELECT
                kir.id AS "id!: Uuid",
                kir.issue_id AS "issue_id!: Uuid",
                kir.related_issue_id AS "related_issue_id!: Uuid",
                kir.relationship_type AS "relationship_type!: KanbanIssueRelationshipType",
                kir.created_at AS "created_at!: DateTime<Utc>"
               FROM kanban_issue_relationships kir
               JOIN kanban_issues ki ON ki.id = kir.issue_id
               WHERE ki.project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateKanbanIssueRelationship,
    ) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query!(
            r#"INSERT OR IGNORE INTO kanban_issue_relationships
                (id, issue_id, related_issue_id, relationship_type)
               VALUES ($1, $2, $3, $4)"#,
            id,
            data.issue_id,
            data.related_issue_id,
            data.relationship_type,
        )
        .execute(pool)
        .await?;

        sqlx::query_as!(
            KanbanIssueRelationship,
            r#"SELECT
                id AS "id!: Uuid",
                issue_id AS "issue_id!: Uuid",
                related_issue_id AS "related_issue_id!: Uuid",
                relationship_type AS "relationship_type!: KanbanIssueRelationshipType",
                created_at AS "created_at!: DateTime<Utc>"
               FROM kanban_issue_relationships
               WHERE id = $1"#,
            id,
        )
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_issue_relationships WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
