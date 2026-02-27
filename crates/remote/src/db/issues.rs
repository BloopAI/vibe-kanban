use api_types::{Issue, IssuePriority, PullRequestStatus};
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use uuid::Uuid;

use super::{
    get_txid, issue_assignees::IssueAssigneeRepository, project_statuses::ProjectStatusRepository,
    pull_requests::PullRequestRepository, workspaces::WorkspaceRepository,
};
use api_types::{DeleteResponse, MutationResponse};

#[derive(Debug, Error)]
pub enum IssueError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("pull request error: {0}")]
    PullRequest(#[from] super::pull_requests::PullRequestError),
    #[error("project status error: {0}")]
    ProjectStatus(#[from] super::project_statuses::ProjectStatusError),
    #[error("workspace error: {0}")]
    Workspace(#[from] super::workspaces::WorkspaceError),
    #[error("issue assignee error: {0}")]
    IssueAssignee(#[from] super::issue_assignees::IssueAssigneeError),
}

pub struct IssueRepository;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum IssueWorkflowSignal {
    ReviewStarted,
    WorkMerged,
}

impl IssueRepository {
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<Issue>, IssueError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
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
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn organization_id(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Option<Uuid>, IssueError> {
        let record = sqlx::query_scalar!(
            r#"
            SELECT p.organization_id
            FROM issues i
            INNER JOIN projects p ON p.id = i.project_id
            WHERE i.id = $1
            "#,
            issue_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Issue>, IssueError> {
        let records = sqlx::query_as!(
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
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        project_id: Uuid,
        status_id: Uuid,
        title: String,
        description: Option<String>,
        priority: Option<IssuePriority>,
        start_date: Option<DateTime<Utc>>,
        target_date: Option<DateTime<Utc>>,
        completed_at: Option<DateTime<Utc>>,
        sort_order: f64,
        parent_issue_id: Option<Uuid>,
        parent_issue_sort_order: Option<f64>,
        extension_metadata: Value,
        creator_user_id: Uuid,
    ) -> Result<MutationResponse<Issue>, IssueError> {
        let mut tx = pool.begin().await?;

        let id = id.unwrap_or_else(Uuid::new_v4);
        // Note: issue_number and simple_id are auto-generated by the DB trigger
        let data = sqlx::query_as!(
            Issue,
            r#"
            INSERT INTO issues (
                id, project_id, status_id, title, description, priority,
                start_date, target_date, completed_at, sort_order,
                parent_issue_id, parent_issue_sort_order, extension_metadata,
                creator_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING
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
            "#,
            id,
            project_id,
            status_id,
            title,
            description,
            priority as Option<IssuePriority>,
            start_date,
            target_date,
            completed_at,
            sort_order,
            parent_issue_id,
            parent_issue_sort_order,
            extension_metadata,
            creator_user_id
        )
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    /// Update an issue with partial fields.
    ///
    /// For non-nullable fields, uses COALESCE to preserve existing values when None is provided.
    /// For nullable fields (Option<Option<T>>), uses CASE to distinguish between:
    /// - None: don't update the field
    /// - Some(None): set the field to NULL
    /// - Some(Some(value)): set the field to the value
    #[allow(clippy::too_many_arguments)]
    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        status_id: Option<Uuid>,
        title: Option<String>,
        description: Option<Option<String>>,
        priority: Option<Option<IssuePriority>>,
        start_date: Option<Option<DateTime<Utc>>>,
        target_date: Option<Option<DateTime<Utc>>>,
        completed_at: Option<Option<DateTime<Utc>>>,
        sort_order: Option<f64>,
        parent_issue_id: Option<Option<Uuid>>,
        parent_issue_sort_order: Option<Option<f64>>,
        extension_metadata: Option<Value>,
    ) -> Result<Issue, IssueError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        // For nullable fields, extract boolean flags and flattened values
        // This preserves the distinction between "don't update" and "set to NULL"
        let update_description = description.is_some();
        let description_value = description.flatten();
        let update_priority = priority.is_some();
        let priority_value = priority.flatten();
        let update_start_date = start_date.is_some();
        let start_date_value = start_date.flatten();
        let update_target_date = target_date.is_some();
        let target_date_value = target_date.flatten();
        let update_completed_at = completed_at.is_some();
        let completed_at_value = completed_at.flatten();
        let update_parent_issue_id = parent_issue_id.is_some();
        let parent_issue_id_value = parent_issue_id.flatten();
        let update_parent_issue_sort_order = parent_issue_sort_order.is_some();
        let parent_issue_sort_order_value = parent_issue_sort_order.flatten();

        let data = sqlx::query_as!(
            Issue,
            r#"
            UPDATE issues
            SET
                status_id = COALESCE($1, status_id),
                title = COALESCE($2, title),
                description = CASE WHEN $3 THEN $4 ELSE description END,
                priority = CASE WHEN $5 THEN $6 ELSE priority END,
                start_date = CASE WHEN $7 THEN $8 ELSE start_date END,
                target_date = CASE WHEN $9 THEN $10 ELSE target_date END,
                completed_at = CASE WHEN $11 THEN $12 ELSE completed_at END,
                sort_order = COALESCE($13, sort_order),
                parent_issue_id = CASE WHEN $14 THEN $15 ELSE parent_issue_id END,
                parent_issue_sort_order = CASE WHEN $16 THEN $17 ELSE parent_issue_sort_order END,
                extension_metadata = COALESCE($18, extension_metadata),
                updated_at = NOW()
            WHERE id = $19
            RETURNING
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
            "#,
            status_id,
            title,
            update_description,
            description_value,
            update_priority,
            priority_value as Option<IssuePriority>,
            update_start_date,
            start_date_value,
            update_target_date,
            target_date_value,
            update_completed_at,
            completed_at_value,
            sort_order,
            update_parent_issue_id,
            parent_issue_id_value,
            update_parent_issue_sort_order,
            parent_issue_sort_order_value,
            extension_metadata,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(data)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, IssueError> {
        let mut tx = pool.begin().await?;

        sqlx::query!("DELETE FROM issues WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(DeleteResponse { txid })
    }

    /// Syncs issue status based on a workflow signal.
    /// - `ReviewStarted` → move issue to "In review"
    /// - `WorkMerged` → if all linked PRs are merged, move issue to "Done"
    async fn sync_status_from_workflow_signal(
        pool: &PgPool,
        issue_id: Uuid,
        signal: IssueWorkflowSignal,
    ) -> Result<(), IssueError> {
        let Some(issue) = Self::find_by_id(pool, issue_id).await? else {
            return Ok(());
        };

        let target_status_name = match signal {
            IssueWorkflowSignal::ReviewStarted => "In review",
            IssueWorkflowSignal::WorkMerged => {
                let prs = PullRequestRepository::list_by_issue(pool, issue_id).await?;
                let all_merged = prs.iter().all(|pr| pr.status == PullRequestStatus::Merged);
                if all_merged {
                    "Done"
                } else {
                    return Ok(());
                }
            }
        };

        let Some(target_status) =
            ProjectStatusRepository::find_by_name(pool, issue.project_id, target_status_name)
                .await?
        else {
            return Ok(());
        };

        if issue.status_id == target_status.id {
            return Ok(());
        }

        Self::update(
            pool,
            issue_id,
            Some(target_status.id),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await?;

        Ok(())
    }

    /// Syncs issue status based on the current pull-request status.
    /// - Open PR => move issue to "In review"
    /// - Merged/closed PR => if all linked PRs are merged, move issue to "Done"
    pub async fn sync_status_from_pull_request(
        pool: &PgPool,
        issue_id: Uuid,
        pr_status: PullRequestStatus,
    ) -> Result<(), IssueError> {
        let signal = if pr_status == PullRequestStatus::Open {
            IssueWorkflowSignal::ReviewStarted
        } else {
            IssueWorkflowSignal::WorkMerged
        };
        Self::sync_status_from_workflow_signal(pool, issue_id, signal).await
    }

    /// Syncs issue status when a workspace is merged locally without a PR.
    pub async fn sync_status_from_local_workspace_merge(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<(), IssueError> {
        Self::sync_status_from_workflow_signal(pool, issue_id, IssueWorkflowSignal::WorkMerged)
            .await
    }

    /// Moves an issue to the given target status if its current status is "Backlog" or "To do".
    async fn move_to_status_if_pending(
        pool: &PgPool,
        issue_id: Uuid,
        current_status_id: Uuid,
        target_status_id: Uuid,
    ) -> Result<(), IssueError> {
        let Some(current_status) =
            ProjectStatusRepository::find_by_id(pool, current_status_id).await?
        else {
            return Ok(());
        };

        let name = current_status.name.to_lowercase();
        if name == "backlog" || name == "to do" {
            Self::update(
                pool,
                issue_id,
                Some(target_status_id),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?;
        }

        Ok(())
    }

    /// Syncs issue state when a workspace is created:
    /// - If this is the first workspace and the issue is in "Backlog" or "To do", moves to "In progress"
    /// - If sub-issue, also moves parent issue to "In progress" if pending
    /// - If the issue has no assignees, adds the workspace creator as an assignee
    pub async fn sync_issue_from_workspace_created(
        pool: &PgPool,
        issue_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), IssueError> {
        // Status sync: only on first workspace
        let workspace_count = WorkspaceRepository::count_by_issue_id(pool, issue_id).await?;
        if workspace_count == 1 {
            let Some(issue) = Self::find_by_id(pool, issue_id).await? else {
                return Ok(());
            };

            let Some(in_progress_status) =
                ProjectStatusRepository::find_by_name(pool, issue.project_id, "In progress")
                    .await?
            else {
                return Ok(());
            };

            Self::move_to_status_if_pending(pool, issue_id, issue.status_id, in_progress_status.id)
                .await?;

            // If sub-issue, also move parent issue to "In progress"
            if let Some(parent_issue_id) = issue.parent_issue_id {
                if let Some(parent_issue) = Self::find_by_id(pool, parent_issue_id).await? {
                    Self::move_to_status_if_pending(
                        pool,
                        parent_issue_id,
                        parent_issue.status_id,
                        in_progress_status.id,
                    )
                    .await?;
                }
            }
        }

        // Assignee sync: add creator if no assignees exist
        let assignees = IssueAssigneeRepository::list_by_issue(pool, issue_id).await?;
        if assignees.is_empty() {
            IssueAssigneeRepository::create(pool, None, issue_id, user_id).await?;
        }

        Ok(())
    }
}
