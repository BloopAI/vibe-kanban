use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectTaskNotificationPreference {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub notify_on_status_updated: bool,
    pub notify_on_completed: bool,
}

#[derive(Debug, Error)]
pub enum ProjectTaskNotificationPreferenceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectTaskNotificationPreferenceRepository;

impl ProjectTaskNotificationPreferenceRepository {
    pub async fn get(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ProjectTaskNotificationPreference>, ProjectTaskNotificationPreferenceError>
    {
        let record = sqlx::query_as!(
            ProjectTaskNotificationPreference,
            r#"
            SELECT
                project_id               AS "project_id!: Uuid",
                user_id                  AS "user_id!: Uuid",
                notify_on_status_updated AS "notify_on_status_updated!",
                notify_on_completed      AS "notify_on_completed!"
            FROM project_task_notification_preferences
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
    ) -> Result<Option<ProjectTaskNotificationPreference>, ProjectTaskNotificationPreferenceError>
    {
        let record = sqlx::query_as!(
            ProjectTaskNotificationPreference,
            r#"
            SELECT
                project_id               AS "project_id!: Uuid",
                user_id                  AS "user_id!: Uuid",
                notify_on_status_updated AS "notify_on_status_updated!",
                notify_on_completed      AS "notify_on_completed!"
            FROM project_task_notification_preferences
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
