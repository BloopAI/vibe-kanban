use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

/// A link between a task and a document
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskDocumentLink {
    pub id: Uuid,
    pub task_id: Uuid,
    pub document_id: Uuid,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Request to link documents to a task
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct LinkDocumentsRequest {
    pub document_ids: Vec<Uuid>,
}

/// Response with linked document info
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LinkedDocument {
    pub id: Uuid,
    pub document_id: Uuid,
    pub document_title: String,
    pub folder_name: Option<String>,
    #[ts(type = "Date")]
    pub linked_at: DateTime<Utc>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct TaskDocumentLinkRow {
    id: Uuid,
    task_id: Uuid,
    document_id: Uuid,
    created_at: DateTime<Utc>,
}

impl From<TaskDocumentLinkRow> for TaskDocumentLink {
    fn from(row: TaskDocumentLinkRow) -> Self {
        Self {
            id: row.id,
            task_id: row.task_id,
            document_id: row.document_id,
            created_at: row.created_at,
        }
    }
}

// Helper struct for linked document with extra info
#[derive(FromRow)]
struct LinkedDocumentRow {
    id: Uuid,
    document_id: Uuid,
    document_title: String,
    folder_name: Option<String>,
    linked_at: DateTime<Utc>,
}

impl From<LinkedDocumentRow> for LinkedDocument {
    fn from(row: LinkedDocumentRow) -> Self {
        Self {
            id: row.id,
            document_id: row.document_id,
            document_title: row.document_title,
            folder_name: row.folder_name,
            linked_at: row.linked_at,
        }
    }
}

impl TaskDocumentLink {
    /// Find all document links for a task with document details
    pub async fn find_by_task_id_with_details(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<LinkedDocument>, sqlx::Error> {
        let rows = sqlx::query_as!(
            LinkedDocumentRow,
            r#"SELECT
                  tdl.id as "id!: Uuid",
                  tdl.document_id as "document_id!: Uuid",
                  d.title as "document_title!",
                  df.name as "folder_name",
                  tdl.created_at as "linked_at!: DateTime<Utc>"
               FROM task_document_links tdl
               JOIN documents d ON d.id = tdl.document_id
               LEFT JOIN document_folders df ON df.id = d.folder_id
               WHERE tdl.task_id = $1
               ORDER BY tdl.created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Link multiple documents to a task
    pub async fn link_documents(
        pool: &SqlitePool,
        task_id: Uuid,
        document_ids: &[Uuid],
    ) -> Result<Vec<TaskDocumentLink>, sqlx::Error> {
        let mut links = Vec::new();

        for doc_id in document_ids {
            // Check if link already exists
            let existing = sqlx::query_scalar!(
                r#"SELECT id as "id: Uuid" FROM task_document_links
                   WHERE task_id = $1 AND document_id = $2"#,
                task_id,
                doc_id
            )
            .fetch_optional(pool)
            .await?;

            if existing.is_some() {
                continue; // Skip if already linked
            }

            let id = Uuid::new_v4();
            let row = sqlx::query_as!(
                TaskDocumentLinkRow,
                r#"INSERT INTO task_document_links (id, task_id, document_id)
                   VALUES ($1, $2, $3)
                   RETURNING id as "id!: Uuid",
                             task_id as "task_id!: Uuid",
                             document_id as "document_id!: Uuid",
                             created_at as "created_at!: DateTime<Utc>""#,
                id,
                task_id,
                doc_id
            )
            .fetch_one(pool)
            .await?;

            links.push(row.into());
        }

        Ok(links)
    }

    /// Unlink a document from a task
    pub async fn unlink_document(
        pool: &SqlitePool,
        task_id: Uuid,
        document_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_document_links WHERE task_id = $1 AND document_id = $2",
            task_id,
            document_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Delete all document links for a task
    pub async fn delete_by_task_id(pool: &SqlitePool, task_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_document_links WHERE task_id = $1",
            task_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
