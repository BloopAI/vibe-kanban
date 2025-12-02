use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{
    identity_errors::IdentityError,
    projects::{ProjectError, ProjectRepository},
    users::{UserData, fetch_user},
};

pub const MAX_SHARED_TASK_TEXT_BYTES: usize = 50 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "task_status", rename_all = "lowercase")]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
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
    pub deleted_at: Option<DateTime<Utc>>,
    pub shared_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSharedTaskData {
    pub project_id: Uuid,
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
    pub acting_user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignTaskData {
    pub new_assignee_user_id: Option<Uuid>,
    pub previous_assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteTaskData {
    pub acting_user_id: Uuid,
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

    pub async fn find_by_id(&self, task_id: Uuid) -> Result<Option<SharedTask>, SharedTaskError> {
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
                deleted_at          AS "deleted_at?",
                shared_at           AS "shared_at?",
                created_at          AS "created_at!",
                updated_at          AS "updated_at!"
            FROM shared_tasks
            WHERE id = $1
              AND deleted_at IS NULL
            "#,
            task_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(task)
    }

    pub async fn create(
        &self,
        data: CreateSharedTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let CreateSharedTaskData {
            project_id,
            title,
            description,
            creator_user_id,
            assignee_user_id,
        } = data;

        ensure_text_size(&title, description.as_deref())?;

        let project = ProjectRepository::find_by_id(&mut tx, project_id)
            .await?
            .ok_or_else(|| {
                tracing::warn!(%project_id, "remote project not found when creating shared task");
                SharedTaskError::NotFound
            })?;

        let organization_id = project.organization_id;

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

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn update(
        &self,
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
            updated_at  = NOW()
        WHERE t.id = $1
          AND t.assignee_user_id = $5
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
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.title,
            data.description,
            data.status as Option<TaskStatus>,
            data.acting_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::NotFound)?;

        ensure_text_size(&task.title, task.description.as_deref())?;

        let user = match task.assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn assign_task(
        &self,
        task_id: Uuid,
        data: AssignTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET assignee_user_id = $2
        WHERE t.id = $1
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
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.new_assignee_user_id,
            data.previous_assignee_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::Conflict("previous assignee mismatch".to_string()))?;

        let user = match data.new_assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn delete_task(
        &self,
        task_id: Uuid,
        data: DeleteTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET deleted_at = NOW(),
            deleted_by_user_id = $2
        WHERE t.id = $1
          AND t.assignee_user_id = $2
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
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.acting_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::Conflict("user not authorized".to_string()))?;

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, None))
    }

    pub async fn check_existence(
        &self,
        task_ids: &[Uuid],
        user_id: Uuid,
    ) -> Result<Vec<Uuid>, SharedTaskError> {
        let tasks = sqlx::query!(
            r#"
            SELECT t.id
            FROM shared_tasks t
            INNER JOIN organization_member_metadata om ON t.organization_id = om.organization_id
            WHERE t.id = ANY($1)
              AND t.deleted_at IS NULL
              AND om.user_id = $2
            "#,
            task_ids,
            user_id
        )
        .fetch_all(self.pool)
        .await?;

        Ok(tasks.into_iter().map(|r| r.id).collect())
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

impl SharedTaskRepository<'_> {
    pub async fn organization_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar!(
            r#"
            SELECT organization_id
            FROM shared_tasks
            WHERE id = $1
            "#,
            task_id
        )
        .fetch_optional(pool)
        .await
    }
}
