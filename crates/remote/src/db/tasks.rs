use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use super::{
    Tx,
    projects::{CreateProjectData, Project, ProjectError, ProjectMetadata, ProjectRepository},
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTaskActivityPayload {
    pub task: SharedTask,
    pub project: ProjectMetadata,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSharedTaskData {
    pub project: ProjectMetadata,
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
    pub acting_user_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignTaskData {
    pub new_assignee_user_id: Option<String>,
    pub previous_assignee_user_id: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug)]
pub enum SharedTaskError {
    NotFound,
    Forbidden,
    Conflict(String),
    Database(sqlx::Error),
    Serialization(serde_json::Error),
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

    pub async fn find_by_id(
        &self,
        organization_id: &str,
        task_id: Uuid,
    ) -> Result<Option<SharedTask>, SharedTaskError> {
        let task = sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                  AS "id!",
                organization_id     AS "organization_id!",
                project_id          AS "project_id!",
                creator_user_id     AS "creator_user_id?",
                assignee_user_id    AS "assignee_user_id?",
                title               AS "title!",
                description         AS "description?",
                status              AS "status!: TaskStatus",
                version             AS "version!",
                shared_at           AS "shared_at?",
                created_at          AS "created_at!",
                updated_at          AS "updated_at!"
            FROM shared_tasks
            WHERE id = $1
              AND organization_id = $2
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
        organization_id: &str,
        data: CreateSharedTaskData,
    ) -> Result<SharedTask, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        dbg!("Received create_shared_task request:", &data);

        let CreateSharedTaskData {
            project,
            title,
            description,
            creator_user_id,
            assignee_user_id,
        } = data;

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
                        organization_id: organization_id.to_string(),
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

        insert_activity(&mut tx, &task, &project, "task.created").await?;
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
          AND t.assignee_user_id = $7
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
            organization_id,
            &data.acting_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::Conflict("task version mismatch".to_string()))?;

        let project = ProjectRepository::find_by_id(&mut tx, task.project_id, organization_id)
            .await?
            .ok_or_else(|| {
                SharedTaskError::Conflict("project not found for shared task".to_string())
            })?;

        insert_activity(&mut tx, &task, &project, "task.updated").await?;

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(task)
    }

    pub async fn assign_task(
        &self,
        organization_id: &str,
        task_id: Uuid,
        data: AssignTaskData,
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

        let project = ProjectRepository::find_by_id(&mut tx, task.project_id, organization_id)
            .await?
            .ok_or_else(|| {
                SharedTaskError::Conflict("project not found for shared task".to_string())
            })?;

        insert_activity(&mut tx, &task, &project, "task.assignment_transferred").await?;
        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(task)
    }
}

async fn insert_activity(
    tx: &mut Tx<'_>,
    task: &SharedTask,
    project: &Project,
    event_type: &str,
) -> Result<(), SharedTaskError> {
    let payload = SharedTaskActivityPayload {
        task: task.clone(),
        project: project.metadata(),
    };
    let value = serde_json::to_value(payload).map_err(SharedTaskError::Serialization)?;

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
        value
    )
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(SharedTaskError::from)
}
