use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::{
    Tx,
    projects::{CreateProjectData, ProjectError, ProjectRepository},
};

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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SharedTask {
    pub id: Uuid,
    pub organization_id: String,
    pub project_id: Uuid,
    pub creator_user_id: Option<String>,
    pub assignee_user_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub version: i64,
    pub shared_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSharedTaskProjectData {
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSharedTaskData {
    pub project_id: Uuid,
    pub project: Option<CreateSharedTaskProjectData>,
    pub title: String,
    pub description: Option<String>,
    pub creator_user_id: String,
    pub assignee_user_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSharedTaskData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TransferTaskAssignmentData {
    pub new_assignee_user_id: Option<String>,
    pub previous_assignee_user_id: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug)]
pub enum SharedTaskError {
    NotFound,
    Conflict(String),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for SharedTaskError {
    fn from(error: sqlx::Error) -> Self {
        if matches!(error, sqlx::Error::RowNotFound) {
            Self::NotFound
        } else {
            Self::Database(error)
        }
    }
}

impl From<ProjectError> for SharedTaskError {
    fn from(error: ProjectError) -> Self {
        match error {
            ProjectError::Conflict(message) => SharedTaskError::Conflict(message),
            ProjectError::Database(err) => SharedTaskError::Database(err),
        }
    }
}

pub struct SharedTaskRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> SharedTaskRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        organization_id: &str,
        data: CreateSharedTaskData,
    ) -> Result<SharedTask, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        dbg!("Received create_shared_task request:", &data);

        let CreateSharedTaskData {
            project_id,
            project,
            title,
            description,
            creator_user_id,
            assignee_user_id,
        } = data;

        let existing_project =
            ProjectRepository::find_by_id(&mut tx, project_id, organization_id).await?;

        if existing_project.is_none() {
            let metadata = project.ok_or_else(|| {
                SharedTaskError::Conflict(
                    "project metadata required to share task for unknown project".to_string(),
                )
            })?;

            ProjectRepository::upsert(
                &mut tx,
                CreateProjectData {
                    id: project_id,
                    organization_id: organization_id.to_string(),
                    github_repository_id: metadata.github_repository_id,
                    owner: metadata.owner,
                    name: metadata.name,
                },
            )
            .await?;
        }

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
                      organization_id    AS "organization_id!",
                      project_id         AS "project_id!",
                      creator_user_id    AS "creator_user_id?",
                      assignee_user_id   AS "assignee_user_id?",
                      title              AS "title!",
                      description        AS "description?",
                      status             AS "status!: TaskStatus",
                      version            AS "version!",
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

        let payload = serde_json::to_value(&task).map_err(|e| {
            SharedTaskError::Conflict(format!("could not serialize task snapshot: {e}"))
        })?;

        insert_activity(&mut tx, &task, "task.created", payload).await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(task)
    }

    pub async fn update(
        &self,
        organization_id: &str,
        task_id: Uuid,
        data: UpdateSharedTaskData,
    ) -> Result<SharedTask, SharedTaskError> {
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
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?",
            t.assignee_user_id  AS "assignee_user_id?",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.version           AS "version!",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.title,
            data.description,
            data.status as Option<TaskStatus>,
            data.version,
            organization_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::Conflict("task version mismatch".to_string()))?;

        let payload = serde_json::to_value(&task).map_err(|e| {
            SharedTaskError::Conflict(format!("could not serialize task snapshot: {e}"))
        })?;

        insert_activity(&mut tx, &task, "task.updated", payload).await?;

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(task)
    }

    pub async fn transfer_task_assignment(
        &self,
        organization_id: &str,
        task_id: Uuid,
        data: TransferTaskAssignmentData,
    ) -> Result<SharedTask, SharedTaskError> {
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
          AND ($3::text IS NULL OR t.assignee_user_id = $3::text)
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?",
            t.assignee_user_id  AS "assignee_user_id?",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.version           AS "version!",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.new_assignee_user_id,
            data.previous_assignee_user_id,
            data.version,
            organization_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            SharedTaskError::Conflict("task version or previous assignee mismatch".to_string())
        })?;

        let payload = serde_json::to_value(&task).map_err(|e| {
            SharedTaskError::Conflict(format!("could not serialize task snapshot: {e}"))
        })?;

        insert_activity(&mut tx, &task, "task.assignment_transferred", payload).await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(task)
    }
}

async fn insert_activity(
    tx: &mut Tx<'_>,
    task: &SharedTask,
    event_type: &str,
    payload: Value,
) -> Result<(), SharedTaskError> {
    sqlx::query!(
        r#"
        INSERT INTO activity (
            organization_id,
            assignee_user_id,
            event_type,
            payload
        )
        VALUES ($1, $2, $3, $4) 
        "#,
        task.organization_id,
        task.assignee_user_id,
        event_type,
        payload
    )
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(SharedTaskError::from)
}
