use api_types::{
    AttachmentWithBlob, Issue, IssueAssignee, IssuePriority, Project, ProjectStatus, User,
};
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ExportRepository;

impl ExportRepository {
    /// Fetch all projects the user can export from the organization.
    pub async fn list_accessible_projects_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<Project>, ExportError> {
        let records = sqlx::query_as!(
            Project,
            r#"
            SELECT
                p.id               AS "id!: Uuid",
                p.organization_id  AS "organization_id!: Uuid",
                p.name             AS "name!",
                p.color            AS "color!",
                p.sort_order       AS "sort_order!",
                p.created_at       AS "created_at!: DateTime<Utc>",
                p.updated_at       AS "updated_at!: DateTime<Utc>"
            FROM projects p
            INNER JOIN organization_member_metadata omm
                ON omm.organization_id = p.organization_id
               AND omm.user_id = $2
            WHERE p.organization_id = $1
            ORDER BY p.sort_order ASC, p.created_at DESC
            "#,
            organization_id,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Fetch selected projects the user can export from the organization.
    pub async fn list_accessible_projects_by_ids(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
        project_ids: &[Uuid],
    ) -> Result<Vec<Project>, ExportError> {
        let records = sqlx::query_as!(
            Project,
            r#"
            SELECT
                p.id               AS "id!: Uuid",
                p.organization_id  AS "organization_id!: Uuid",
                p.name             AS "name!",
                p.color            AS "color!",
                p.sort_order       AS "sort_order!",
                p.created_at       AS "created_at!: DateTime<Utc>",
                p.updated_at       AS "updated_at!: DateTime<Utc>"
            FROM projects p
            INNER JOIN organization_member_metadata omm
                ON omm.organization_id = p.organization_id
               AND omm.user_id = $3
            WHERE p.organization_id = $1
              AND p.id = ANY($2)
            ORDER BY p.sort_order ASC, p.created_at DESC
            "#,
            organization_id,
            project_ids,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Fetch all issues for the given project IDs (no pagination).
    pub async fn list_all_issues_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<Issue>, ExportError> {
        let issues = sqlx::query_as!(
            Issue,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                issue_number        AS "issue_number!",
                simple_id           AS "simple_id!",
                status_id           AS "status_id!: Uuid",
                title               AS "title!",
                description         AS "description?",
                priority            AS "priority: IssuePriority",
                start_date          AS "start_date?: DateTime<Utc>",
                target_date         AS "target_date?: DateTime<Utc>",
                completed_at        AS "completed_at?: DateTime<Utc>",
                sort_order          AS "sort_order!",
                parent_issue_id     AS "parent_issue_id?: Uuid",
                parent_issue_sort_order AS "parent_issue_sort_order?",
                extension_metadata  AS "extension_metadata!: Value",
                creator_user_id     AS "creator_user_id?: Uuid",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM issues
            WHERE project_id = ANY($1)
            ORDER BY project_id, issue_number ASC
            "#,
            project_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(issues)
    }

    /// Fetch all statuses for the given project IDs.
    pub async fn list_statuses_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<ProjectStatus>, ExportError> {
        let records = sqlx::query_as!(
            ProjectStatus,
            r#"
            SELECT
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                hidden          AS "hidden!",
                created_at      AS "created_at!: DateTime<Utc>"
            FROM project_statuses
            WHERE project_id = ANY($1)
            ORDER BY project_id, sort_order ASC
            "#,
            project_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Fetch all assignees for issues in the given project IDs.
    pub async fn list_assignees_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<IssueAssignee>, ExportError> {
        let records = sqlx::query_as!(
            IssueAssignee,
            r#"
            SELECT
                ia.id          AS "id!: Uuid",
                ia.issue_id    AS "issue_id!: Uuid",
                ia.user_id     AS "user_id!: Uuid",
                ia.assigned_at AS "assigned_at!: DateTime<Utc>"
            FROM issue_assignees ia
            INNER JOIN issues i ON i.id = ia.issue_id
            WHERE i.project_id = ANY($1)
            ORDER BY ia.assigned_at ASC
            "#,
            project_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Fetch all attachments (with blob metadata) for issues in the given project IDs.
    pub async fn list_attachments_by_projects(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<AttachmentWithBlob>, ExportError> {
        let attachments = sqlx::query_as!(
            AttachmentWithBlob,
            r#"
            SELECT
                a.id                    AS "id!: Uuid",
                a.blob_id               AS "blob_id!: Uuid",
                a.issue_id              AS "issue_id?: Uuid",
                a.comment_id            AS "comment_id?: Uuid",
                a.created_at            AS "created_at!: DateTime<Utc>",
                a.expires_at            AS "expires_at?: DateTime<Utc>",
                b.blob_path             AS "blob_path!",
                b.thumbnail_blob_path   AS "thumbnail_blob_path?",
                b.original_name         AS "original_name!",
                b.mime_type             AS "mime_type?",
                b.size_bytes            AS "size_bytes!",
                b.hash                  AS "hash!",
                b.width                 AS "width?",
                b.height                AS "height?"
            FROM attachments a
            INNER JOIN blobs b ON b.id = a.blob_id
            INNER JOIN issues i ON i.id = a.issue_id
            WHERE i.project_id = ANY($1)
              AND a.expires_at IS NULL
            ORDER BY a.created_at ASC
            "#,
            project_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(attachments)
    }

    /// Fetch all users who are members of the given organization.
    pub async fn list_users_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
    ) -> Result<Vec<User>, ExportError> {
        let users = sqlx::query_as!(
            User,
            r#"
            SELECT
                u.id          AS "id!: Uuid",
                u.email       AS "email!",
                u.first_name  AS "first_name?",
                u.last_name   AS "last_name?",
                u.username    AS "username?",
                u.created_at  AS "created_at!: DateTime<Utc>",
                u.updated_at  AS "updated_at!: DateTime<Utc>"
            FROM users u
            INNER JOIN organization_member_metadata omm ON omm.user_id = u.id
            WHERE omm.organization_id = $1
            "#,
            organization_id
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }
}
