use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectNotificationPreference {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub notify_on_task_created: bool,
    pub notify_on_task_assigned: bool,
}

#[derive(Debug, Error)]
pub enum ProjectNotificationPreferenceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectNotificationPreferenceRepository;

impl ProjectNotificationPreferenceRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ProjectNotificationPreference>, ProjectNotificationPreferenceError> {
        let record = sqlx::query_as!(
            ProjectNotificationPreference,
            r#"
            SELECT
                project_id              AS "project_id!: Uuid",
                user_id                 AS "user_id!: Uuid",
                notify_on_task_created  AS "notify_on_task_created!",
                notify_on_task_assigned AS "notify_on_task_assigned!"
            FROM project_notification_preferences
            WHERE project_id = $1 AND user_id = $2
            "#,
            project_id,
            user_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch(
        pool: &PgPool,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ProjectNotificationPreference>, ProjectNotificationPreferenceError> {
        let record = sqlx::query_as!(
            ProjectNotificationPreference,
            r#"
            SELECT
                project_id              AS "project_id!: Uuid",
                user_id                 AS "user_id!: Uuid",
                notify_on_task_created  AS "notify_on_task_created!",
                notify_on_task_assigned AS "notify_on_task_assigned!"
            FROM project_notification_preferences
            WHERE project_id = $1 AND user_id = $2
            "#,
            project_id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
