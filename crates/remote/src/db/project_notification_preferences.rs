use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectNotificationPreference {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub notify_on_issue_created: bool,
    pub notify_on_issue_assigned: bool,
}

#[derive(Debug, Error)]
pub enum ProjectNotificationPreferenceError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectNotificationPreferenceRepository;

impl ProjectNotificationPreferenceRepository {
    pub async fn find<'e, E>(
        executor: E,
        project_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<ProjectNotificationPreference>, ProjectNotificationPreferenceError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            ProjectNotificationPreference,
            r#"
            SELECT
                project_id               AS "project_id!: Uuid",
                user_id                  AS "user_id!: Uuid",
                notify_on_issue_created  AS "notify_on_issue_created!",
                notify_on_issue_assigned AS "notify_on_issue_assigned!"
            FROM project_notification_preferences
            WHERE project_id = $1 AND user_id = $2
            "#,
            project_id,
            user_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
