use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, Default)]
#[sqlx(type_name = "meeting_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MeetingStatus {
    #[default]
    Active,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct RefinementMeeting {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub status: MeetingStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MeetingMessage {
    pub id: Uuid,
    pub meeting_id: Uuid,
    pub role: String, // "user" or "assistant"
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MeetingOutput {
    pub id: Uuid,
    pub meeting_id: Uuid,
    pub output_json: String,
    pub synced_to_kanban: bool,
    pub synced_at: Option<DateTime<Utc>>,
}

impl RefinementMeeting {
    pub async fn create(
        pool: &SqlitePool,
        project_id: Uuid,
        title: String,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            RefinementMeeting,
            r#"INSERT INTO refinement_meetings (id, project_id, title, status)
               VALUES ($1, $2, $3, 'active')
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, status as "status!: MeetingStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            title
        )
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            RefinementMeeting,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, status as "status!: MeetingStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM refinement_meetings
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            RefinementMeeting,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, status as "status!: MeetingStatus", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM refinement_meetings
               WHERE project_id = $1
               ORDER BY created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: MeetingStatus,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE refinement_meetings SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id,
            status
        )
        .execute(pool)
        .await?;
        Ok(())
    }
}

impl MeetingMessage {
    pub async fn create(
        pool: &SqlitePool,
        meeting_id: Uuid,
        role: String,
        content: String,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            MeetingMessage,
            r#"INSERT INTO meeting_messages (id, meeting_id, role, content)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid", meeting_id as "meeting_id!: Uuid", role, content, created_at as "created_at!: DateTime<Utc>""#,
            id,
            meeting_id,
            role,
            content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_meeting(
        pool: &SqlitePool,
        meeting_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            MeetingMessage,
            r#"SELECT id as "id!: Uuid", meeting_id as "meeting_id!: Uuid", role, content, created_at as "created_at!: DateTime<Utc>"
               FROM meeting_messages
               WHERE meeting_id = $1
               ORDER BY created_at ASC"#,
            meeting_id
        )
        .fetch_all(pool)
        .await
    }
}
