use api_types::{AttachmentWithBlob, Issue, IssueComment, User};
use sqlx::{PgPool, Row};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ExportRepository;

impl ExportRepository {
    /// Fetch all issues for the given project IDs (no pagination).
    pub async fn list_all_issues_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<Issue>, ExportError> {
        let rows = sqlx::query(
            r#"
            SELECT
                id, project_id, issue_number, simple_id, status_id,
                title, description, priority, start_date, target_date,
                completed_at, sort_order, parent_issue_id, parent_issue_sort_order,
                extension_metadata, creator_user_id, created_at, updated_at
            FROM issues
            WHERE project_id = ANY($1)
            ORDER BY project_id, issue_number ASC
            "#,
        )
        .bind(project_ids)
        .fetch_all(pool)
        .await?;

        let mut issues = Vec::with_capacity(rows.len());
        for row in rows {
            issues.push(Issue {
                id: row.get("id"),
                project_id: row.get("project_id"),
                issue_number: row.get("issue_number"),
                simple_id: row.get("simple_id"),
                status_id: row.get("status_id"),
                title: row.get("title"),
                description: row.get("description"),
                priority: row.get("priority"),
                start_date: row.get("start_date"),
                target_date: row.get("target_date"),
                completed_at: row.get("completed_at"),
                sort_order: row.get("sort_order"),
                parent_issue_id: row.get("parent_issue_id"),
                parent_issue_sort_order: row.get("parent_issue_sort_order"),
                extension_metadata: row.get("extension_metadata"),
                creator_user_id: row.get("creator_user_id"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            });
        }

        Ok(issues)
    }

    /// Fetch all comments for issues in the given project IDs.
    pub async fn list_comments_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<IssueComment>, ExportError> {
        let rows = sqlx::query(
            r#"
            SELECT
                ic.id, ic.issue_id, ic.author_id, ic.parent_id,
                ic.message, ic.created_at, ic.updated_at
            FROM issue_comments ic
            INNER JOIN issues i ON i.id = ic.issue_id
            WHERE i.project_id = ANY($1)
            ORDER BY ic.created_at ASC
            "#,
        )
        .bind(project_ids)
        .fetch_all(pool)
        .await?;

        let mut comments = Vec::with_capacity(rows.len());
        for row in rows {
            comments.push(IssueComment {
                id: row.get("id"),
                issue_id: row.get("issue_id"),
                author_id: row.get("author_id"),
                parent_id: row.get("parent_id"),
                message: row.get("message"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            });
        }

        Ok(comments)
    }

    /// Fetch all attachments (with blob metadata) for issues in the given project IDs.
    pub async fn list_attachments_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<AttachmentWithBlob>, ExportError> {
        let rows = sqlx::query(
            r#"
            SELECT
                a.id, a.blob_id, a.issue_id, a.comment_id,
                a.created_at, a.expires_at,
                b.blob_path, b.thumbnail_blob_path, b.original_name,
                b.mime_type, b.size_bytes, b.hash, b.width, b.height
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            INNER JOIN issues i ON i.id = a.issue_id
            WHERE i.project_id = ANY($1)
              AND a.expires_at IS NULL
            ORDER BY a.created_at ASC
            "#,
        )
        .bind(project_ids)
        .fetch_all(pool)
        .await?;

        let mut attachments = Vec::with_capacity(rows.len());
        for row in rows {
            attachments.push(AttachmentWithBlob {
                id: row.get("id"),
                blob_id: row.get("blob_id"),
                issue_id: row.get("issue_id"),
                comment_id: row.get("comment_id"),
                created_at: row.get("created_at"),
                expires_at: row.get("expires_at"),
                blob_path: row.get("blob_path"),
                thumbnail_blob_path: row.get("thumbnail_blob_path"),
                original_name: row.get("original_name"),
                mime_type: row.get("mime_type"),
                size_bytes: row.get("size_bytes"),
                hash: row.get("hash"),
                width: row.get("width"),
                height: row.get("height"),
            });
        }

        Ok(attachments)
    }

    /// Fetch all users who are members of the given organization.
    pub async fn list_users_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
    ) -> Result<Vec<User>, ExportError> {
        let rows = sqlx::query(
            r#"
            SELECT
                u.id, u.email, u.first_name, u.last_name,
                u.username, u.created_at, u.updated_at
            FROM users u
            INNER JOIN organization_member_metadata omm ON omm.user_id = u.id
            WHERE omm.organization_id = $1
            "#,
        )
        .bind(organization_id)
        .fetch_all(pool)
        .await?;

        let mut users = Vec::with_capacity(rows.len());
        for row in rows {
            users.push(User {
                id: row.get("id"),
                email: row.get("email"),
                first_name: row.get("first_name"),
                last_name: row.get("last_name"),
                username: row.get("username"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            });
        }

        Ok(users)
    }
}
