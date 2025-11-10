use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::{
    Tx,
    identity_errors::IdentityError,
    projects::{CreateProjectData, Project, ProjectError, ProjectMetadata, ProjectRepository},
    users::{UserData, fetch_user},
};

pub struct BulkFetchResult {
    pub tasks: Vec<SharedTaskActivityPayload>,
    pub deleted_task_ids: Vec<Uuid>,
    pub latest_seq: Option<i64>,
}

pub const MAX_SHARED_TASK_TEXT_BYTES: usize = 50 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "kebab-case")]
#[sqlx(type_name = "task_status", rename_all = "kebab-case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTaskWithUser {
    pub task: SharedTask,
    pub user: Option<UserData>,
}

impl SharedTaskWithUser {
    pub fn new(task: SharedTask, user: Option<UserData>) -> Self {
        Self { task, user }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SharedTask {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub creator_user_id: Option<Uuid>,
    pub assignee_user_id: Option<Uuid>,
    pub deleted_by_user_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub version: i64,
    pub deleted_at: Option<DateTime<Utc>>,
    pub shared_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTaskActivityPayload {
    pub task: SharedTask,
    pub project: ProjectMetadata,
    pub user: Option<UserData>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSharedTaskData {
    pub project: ProjectMetadata,
    pub title: String,
    pub description: Option<String>,
    pub creator_user_id: Uuid,
    pub assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSharedTaskData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub version: Option<i64>,
    pub acting_user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignTaskData {
    pub new_assignee_user_id: Option<Uuid>,
    pub previous_assignee_user_id: Option<Uuid>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteTaskData {
    pub acting_user_id: Uuid,
    pub version: Option<i64>,
}

#[derive(Debug, Error)]
pub enum SharedTaskError {
    #[error("shared task not found")]
    NotFound,
    #[error("operation forbidden")]
    Forbidden,
    #[error("shared task conflict: {0}")]
    Conflict(String),
    #[error("shared task title and description are too large")]
    PayloadTooLarge,
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error(transparent)]
    Identity(#[from] IdentityError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
}

pub struct SharedTaskRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> SharedTaskRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(
        &self,
        organization_id: Uuid,
        task_id: Uuid,
    ) -> Result<Option<SharedTask>, SharedTaskError> {
        let task = sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                  AS "id!",
                organization_id     AS "organization_id!: Uuid",
                project_id          AS "project_id!",
                creator_user_id     AS "creator_user_id?: Uuid",
                assignee_user_id    AS "assignee_user_id?: Uuid",
                deleted_by_user_id  AS "deleted_by_user_id?: Uuid",
                title               AS "title!",
                description         AS "description?",
                status              AS "status!: TaskStatus",
                version             AS "version!",
                deleted_at          AS "deleted_at?",
                shared_at           AS "shared_at?",
                created_at          AS "created_at!",
                updated_at          AS "updated_at!"
            FROM shared_tasks
            WHERE id = $1
              AND organization_id = $2
              AND deleted_at IS NULL
            "#,
            task_id,
            organization_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(task)
    }

    pub async fn create(
        &self,
        organization_id: Uuid,
        data: CreateSharedTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let CreateSharedTaskData {
            project,
            title,
            description,
            creator_user_id,
            assignee_user_id,
        } = data;

        ensure_text_size(&title, description.as_deref())?;

        let project = match ProjectRepository::find_by_github_repo_id(
            &mut tx,
            organization_id,
            project.github_repository_id,
        )
        .await?
        {
            Some(existing_project) => existing_project,
            None => {
                tracing::info!(
                    "Creating new project for shared task: org_id={}, github_repo_id={}",
                    organization_id,
                    project.github_repository_id
                );

                ProjectRepository::insert(
                    &mut tx,
                    CreateProjectData {
                        organization_id,
                        metadata: project,
                    },
                )
                .await?
            }
        };

        let project_id = project.id;
        let task = sqlx::query_as!(
            SharedTask,
            r#"
            INSERT INTO shared_tasks (
                organization_id,
                project_id,
                creator_user_id,
                assignee_user_id,
                title,
                description,
                shared_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id                 AS "id!",
                      organization_id    AS "organization_id!: Uuid",
                      project_id         AS "project_id!",
                      creator_user_id    AS "creator_user_id?: Uuid",
                      assignee_user_id   AS "assignee_user_id?: Uuid",
                      deleted_by_user_id AS "deleted_by_user_id?: Uuid",
                      title              AS "title!",
                      description        AS "description?",
                      status             AS "status!: TaskStatus",
                      version            AS "version!",
                      deleted_at         AS "deleted_at?",
                      shared_at          AS "shared_at?",
                      created_at         AS "created_at!",
                      updated_at         AS "updated_at!"
            "#,
            organization_id,
            project_id,
            creator_user_id,
            assignee_user_id,
            title,
            description
        )
        .fetch_one(&mut *tx)
        .await?;

        let user = match assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        insert_activity(&mut tx, &task, &project, user.as_ref(), "task.created").await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn bulk_fetch(
        &self,
        organization_id: Uuid,
    ) -> Result<BulkFetchResult, SharedTaskError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            .execute(&mut *tx)
            .await?;

        let rows = sqlx::query!(
            r#"
            SELECT
                st.id                     AS "id!: Uuid",
                st.organization_id        AS "organization_id!: Uuid",
                st.project_id             AS "project_id!: Uuid",
                st.creator_user_id        AS "creator_user_id?: Uuid",
                st.assignee_user_id       AS "assignee_user_id?: Uuid",
                st.deleted_by_user_id     AS "deleted_by_user_id?: Uuid",
                st.title                  AS "title!",
                st.description            AS "description?",
                st.status                 AS "status!: TaskStatus",
                st.version                AS "version!",
                st.deleted_at             AS "deleted_at?",
                st.shared_at              AS "shared_at?",
                st.created_at             AS "created_at!",
                st.updated_at             AS "updated_at!",
                p.github_repository_id    AS "project_github_repository_id!",
                p.owner                   AS "project_owner!",
                p.name                    AS "project_name!",
                u.id                      AS "user_id?: Uuid",
                u.first_name              AS "user_first_name?",
                u.last_name               AS "user_last_name?",
                u.username                AS "user_username?"
            FROM shared_tasks st
            JOIN projects p ON st.project_id = p.id
            LEFT JOIN users u ON st.assignee_user_id = u.id
            WHERE st.organization_id = $1
              AND st.deleted_at IS NULL
            ORDER BY st.updated_at DESC
            "#,
            organization_id
        )
        .fetch_all(&mut *tx)
        .await?;

        let tasks = rows
            .into_iter()
            .map(|row| {
                let task = SharedTask {
                    id: row.id,
                    organization_id: row.organization_id,
                    project_id: row.project_id,
                    creator_user_id: row.creator_user_id,
                    assignee_user_id: row.assignee_user_id,
                    deleted_by_user_id: row.deleted_by_user_id,
                    title: row.title,
                    description: row.description,
                    status: row.status,
                    version: row.version,
                    deleted_at: row.deleted_at,
                    shared_at: row.shared_at,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                };

                let project = ProjectMetadata {
                    github_repository_id: row.project_github_repository_id,
                    owner: row.project_owner,
                    name: row.project_name,
                };

                let user = row.user_id.map(|id| UserData {
                    id,
                    first_name: row.user_first_name,
                    last_name: row.user_last_name,
                    username: row.user_username,
                });

                SharedTaskActivityPayload {
                    task,
                    user,
                    project,
                }
            })
            .collect();

        let deleted_rows = sqlx::query!(
            r#"
            SELECT st.id AS "id!: Uuid"
            FROM shared_tasks st
            JOIN projects p ON st.project_id = p.id
            WHERE st.organization_id = $1
              AND st.deleted_at IS NOT NULL
            "#,
            organization_id
        )
        .fetch_all(&mut *tx)
        .await?;

        let deleted_task_ids = deleted_rows.into_iter().map(|row| row.id).collect();

        let latest_seq = sqlx::query_scalar!(
            r#"
            SELECT MAX(seq)
            FROM activity
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(BulkFetchResult {
            tasks,
            deleted_task_ids,
            latest_seq,
        })
    }

    pub async fn update(
        &self,
        organization_id: Uuid,
        task_id: Uuid,
        data: UpdateSharedTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET title       = COALESCE($2, t.title),
            description = COALESCE($3, t.description),
            status      = COALESCE($4, t.status),
            version     = t.version + 1,
            updated_at  = NOW()
        WHERE t.id = $1
          AND t.organization_id = $6
          AND t.version = COALESCE($5, t.version)
          AND t.assignee_user_id = $7
          AND t.deleted_at IS NULL
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!: Uuid",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?: Uuid",
            t.assignee_user_id  AS "assignee_user_id?: Uuid",
            t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.version           AS "version!",
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.title,
            data.description,
            data.status as Option<TaskStatus>,
            data.version,
            organization_id,
            data.acting_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::Conflict("task version mismatch".to_string()))?;

        ensure_text_size(&task.title, task.description.as_deref())?;

        let project = ProjectRepository::find_by_id(&mut tx, task.project_id, organization_id)
            .await?
            .ok_or_else(|| {
                SharedTaskError::Conflict("project not found for shared task".to_string())
            })?;

        let user = match task.assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        insert_activity(&mut tx, &task, &project, user.as_ref(), "task.updated").await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn assign_task(
        &self,
        organization_id: Uuid,
        task_id: Uuid,
        data: AssignTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET assignee_user_id = $2,
            version = t.version + 1,
            updated_at = NOW()
        WHERE t.id = $1
          AND t.organization_id = $5
          AND t.version = COALESCE($4, t.version)
          AND ($3::uuid IS NULL OR t.assignee_user_id = $3::uuid)
          AND t.deleted_at IS NULL
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!: Uuid",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?: Uuid",
            t.assignee_user_id  AS "assignee_user_id?: Uuid",
            t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.version           AS "version!",
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.new_assignee_user_id,
            data.previous_assignee_user_id,
            data.version,
            organization_id,
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            SharedTaskError::Conflict("task version or previous assignee mismatch".to_string())
        })?;

        let project = ProjectRepository::find_by_id(&mut tx, task.project_id, organization_id)
            .await?
            .ok_or_else(|| {
                SharedTaskError::Conflict("project not found for shared task".to_string())
            })?;

        let user = match data.new_assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        insert_activity(&mut tx, &task, &project, user.as_ref(), "task.reassigned").await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn delete_task(
        &self,
        organization_id: Uuid,
        task_id: Uuid,
        data: DeleteTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET deleted_at = NOW(),
            deleted_by_user_id = $4,
            version = t.version + 1,
            updated_at = NOW()
        WHERE t.id = $1
          AND t.organization_id = $2
          AND t.version = COALESCE($3, t.version)
          AND t.assignee_user_id = $4
          AND t.deleted_at IS NULL
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!: Uuid",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?: Uuid",
            t.assignee_user_id  AS "assignee_user_id?: Uuid",
            t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.version           AS "version!",
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            organization_id,
            data.version,
            data.acting_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            SharedTaskError::Conflict("task version mismatch or user not authorized".to_string())
        })?;

        let project = ProjectRepository::find_by_id(&mut tx, task.project_id, organization_id)
            .await?
            .ok_or_else(|| {
                SharedTaskError::Conflict("project not found for shared task".to_string())
            })?;

        insert_activity(&mut tx, &task, &project, None, "task.deleted").await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, None))
    }
}

pub(crate) fn ensure_text_size(
    title: &str,
    description: Option<&str>,
) -> Result<(), SharedTaskError> {
    let total = title.len() + description.map(|value| value.len()).unwrap_or(0);

    if total > MAX_SHARED_TASK_TEXT_BYTES {
        return Err(SharedTaskError::PayloadTooLarge);
    }

    Ok(())
}

async fn insert_activity(
    tx: &mut Tx<'_>,
    task: &SharedTask,
    project: &Project,
    user: Option<&UserData>,
    event_type: &str,
) -> Result<(), SharedTaskError> {
    let payload = SharedTaskActivityPayload {
        task: task.clone(),
        project: project.metadata(),
        user: user.cloned(),
    };
    let value = serde_json::to_value(payload).map_err(SharedTaskError::Serialization)?;

    sqlx::query!(
        r#"
        WITH next AS (
            INSERT INTO organization_activity_counters AS counters (organization_id, last_seq)
            VALUES ($1, 1)
            ON CONFLICT (organization_id)
            DO UPDATE SET last_seq = counters.last_seq + 1
            RETURNING last_seq
        )
        INSERT INTO activity (
            organization_id,
            seq,
            assignee_user_id,
            event_type,
            payload
        )
        SELECT $1, next.last_seq, $2, $3, $4
        FROM next
        "#,
        task.organization_id,
        task.assignee_user_id,
        event_type,
        value
    )
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(SharedTaskError::from)
}
