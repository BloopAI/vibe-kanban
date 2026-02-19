use api_types::Workspace;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct CreateWorkspaceParams {
    pub project_id: Uuid,
    pub owner_user_id: Uuid,
    pub local_workspace_id: Option<Uuid>,
    pub issue_id: Option<Uuid>,
    pub name: Option<String>,
    pub archived: Option<bool>,
    pub files_changed: Option<i32>,
    pub lines_added: Option<i32>,
    pub lines_removed: Option<i32>,
}

pub struct WorkspaceRepository;

impl WorkspaceRepository {
    pub async fn list_by_owner(
        pool: &PgPool,
        owner_user_id: Uuid,
    ) -> Result<Vec<Workspace>, WorkspaceError> {
        let records = sqlx::query_as!(
            Workspace,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                owner_user_id       AS "owner_user_id!: Uuid",
                issue_id            AS "issue_id: Uuid",
                local_workspace_id  AS "local_workspace_id: Uuid",
                name                AS "name: String",
                archived            AS "archived!: bool",
                files_changed       AS "files_changed: i32",
                lines_added         AS "lines_added: i32",
                lines_removed       AS "lines_removed: i32",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM workspaces
            WHERE owner_user_id = $1
            "#,
            owner_user_id
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Workspace>, WorkspaceError> {
        let records = sqlx::query_as!(
            Workspace,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                owner_user_id       AS "owner_user_id!: Uuid",
                issue_id            AS "issue_id: Uuid",
                local_workspace_id  AS "local_workspace_id: Uuid",
                name                AS "name: String",
                archived            AS "archived!: bool",
                files_changed       AS "files_changed: i32",
                lines_added         AS "lines_added: i32",
                lines_removed       AS "lines_removed: i32",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM workspaces
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;
        Ok(records)
    }

    pub async fn create(
        pool: &PgPool,
        params: CreateWorkspaceParams,
    ) -> Result<Workspace, WorkspaceError> {
        let CreateWorkspaceParams {
            project_id,
            owner_user_id,
            local_workspace_id,
            issue_id,
            name,
            archived,
            files_changed,
            lines_added,
            lines_removed,
        } = params;
        let archived = archived.unwrap_or(false);
        let record = sqlx::query_as!(
            Workspace,
            r#"
            INSERT INTO workspaces (project_id, owner_user_id, local_workspace_id, issue_id, name, archived, files_changed, lines_added, lines_removed)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                owner_user_id       AS "owner_user_id!: Uuid",
                issue_id            AS "issue_id: Uuid",
                local_workspace_id  AS "local_workspace_id: Uuid",
                name                AS "name: String",
                archived            AS "archived!: bool",
                files_changed       AS "files_changed: i32",
                lines_added         AS "lines_added: i32",
                lines_removed       AS "lines_removed: i32",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            "#,
            project_id,
            owner_user_id,
            local_workspace_id,
            issue_id,
            name,
            archived,
            files_changed,
            lines_added,
            lines_removed
        )
        .fetch_one(pool)
        .await?;
        Ok(record)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Workspace>, WorkspaceError> {
        let record = sqlx::query_as!(
            Workspace,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                owner_user_id       AS "owner_user_id!: Uuid",
                issue_id            AS "issue_id: Uuid",
                local_workspace_id  AS "local_workspace_id: Uuid",
                name                AS "name: String",
                archived            AS "archived!: bool",
                files_changed       AS "files_changed: i32",
                lines_added         AS "lines_added: i32",
                lines_removed       AS "lines_removed: i32",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM workspaces
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn find_by_local_id(
        pool: &PgPool,
        local_workspace_id: Uuid,
    ) -> Result<Option<Workspace>, WorkspaceError> {
        let record = sqlx::query_as!(
            Workspace,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                owner_user_id       AS "owner_user_id!: Uuid",
                issue_id            AS "issue_id: Uuid",
                local_workspace_id  AS "local_workspace_id: Uuid",
                name                AS "name: String",
                archived            AS "archived!: bool",
                files_changed       AS "files_changed: i32",
                lines_added         AS "lines_added: i32",
                lines_removed       AS "lines_removed: i32",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM workspaces
            WHERE local_workspace_id = $1
            "#,
            local_workspace_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn exists_by_local_id(
        pool: &PgPool,
        local_workspace_id: Uuid,
    ) -> Result<bool, WorkspaceError> {
        let exists = sqlx::query_scalar!(
            r#"SELECT EXISTS(SELECT 1 FROM workspaces WHERE local_workspace_id = $1) AS "exists!""#,
            local_workspace_id
        )
        .fetch_one(pool)
        .await?;
        Ok(exists)
    }

    pub async fn delete_by_local_id(
        pool: &PgPool,
        local_workspace_id: Uuid,
    ) -> Result<(), WorkspaceError> {
        sqlx::query!(
            "DELETE FROM workspaces WHERE local_workspace_id = $1",
            local_workspace_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), WorkspaceError> {
        sqlx::query!("DELETE FROM workspaces WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn count_by_issue_id(pool: &PgPool, issue_id: Uuid) -> Result<i64, WorkspaceError> {
        let count = sqlx::query_scalar!(
            r#"SELECT COUNT(*) AS "count!" FROM workspaces WHERE issue_id = $1"#,
            issue_id
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: Option<Option<String>>,
        archived: Option<bool>,
        files_changed: Option<Option<i32>>,
        lines_added: Option<Option<i32>>,
        lines_removed: Option<Option<i32>>,
    ) -> Result<Workspace, WorkspaceError> {
        let update_name = name.is_some();
        let name_value = name.flatten();

        let update_archived = archived.is_some();
        let archived_value = archived.unwrap_or(false);

        let update_files_changed = files_changed.is_some();
        let files_changed_value = files_changed.flatten();

        let update_lines_added = lines_added.is_some();
        let lines_added_value = lines_added.flatten();

        let update_lines_removed = lines_removed.is_some();
        let lines_removed_value = lines_removed.flatten();

        let record = sqlx::query_as!(
            Workspace,
            r#"
            UPDATE workspaces SET
                name = CASE WHEN $1 THEN $2 ELSE name END,
                archived = CASE WHEN $3 THEN $4 ELSE archived END,
                files_changed = CASE WHEN $5 THEN $6 ELSE files_changed END,
                lines_added = CASE WHEN $7 THEN $8 ELSE lines_added END,
                lines_removed = CASE WHEN $9 THEN $10 ELSE lines_removed END,
                updated_at = NOW()
            WHERE id = $11
            RETURNING
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                owner_user_id       AS "owner_user_id!: Uuid",
                issue_id            AS "issue_id: Uuid",
                local_workspace_id  AS "local_workspace_id: Uuid",
                name                AS "name: String",
                archived            AS "archived!: bool",
                files_changed       AS "files_changed: i32",
                lines_added         AS "lines_added: i32",
                lines_removed       AS "lines_removed: i32",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            "#,
            update_name,
            name_value,
            update_archived,
            archived_value,
            update_files_changed,
            files_changed_value,
            update_lines_added,
            lines_added_value,
            update_lines_removed,
            lines_removed_value,
            id
        )
        .fetch_one(pool)
        .await?;

        Ok(record)
    }
}
