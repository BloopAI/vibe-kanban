use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FollowUpDraft {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub prompt: String,
    pub queued: bool,
    pub sending: bool,
    pub variant: Option<String>,
    // Stored as JSON in the DB; serde handles Uuid <-> string in JSON
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_ids: Option<Vec<Uuid>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: i64,
}

#[derive(Debug, Clone, FromRow)]
struct FollowUpDraftRow {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub prompt: String,
    pub queued: bool,
    pub sending: bool,
    pub variant: Option<String>,
    pub image_ids: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: i64,
}

impl From<FollowUpDraftRow> for FollowUpDraft {
    fn from(r: FollowUpDraftRow) -> Self {
        let image_ids = r
            .image_ids
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<Uuid>>(s).ok());
        FollowUpDraft {
            id: r.id,
            task_attempt_id: r.task_attempt_id,
            prompt: r.prompt,
            queued: r.queued,
            sending: r.sending,
            variant: r.variant,
            image_ids,
            created_at: r.created_at,
            updated_at: r.updated_at,
            version: r.version,
        }
    }
}

#[derive(Debug, Deserialize, TS)]
pub struct UpsertFollowUpDraft {
    pub task_attempt_id: Uuid,
    pub prompt: String,
    pub queued: bool,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
}

impl FollowUpDraft {
    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            FollowUpDraftRow,
            r#"SELECT 
                id               as "id!: Uuid",
                task_attempt_id  as "task_attempt_id!: Uuid",
                prompt           as "prompt!: String",
                queued           as "queued!: bool",
                sending          as "sending!: bool",
                variant,
                image_ids        as "image_ids?: String",
                created_at       as "created_at!: DateTime<Utc>",
                updated_at       as "updated_at!: DateTime<Utc>",
                version          as "version!: i64"
              FROM follow_up_drafts
             WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.map(FollowUpDraft::from))
    }
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            FollowUpDraftRow,
            r#"SELECT 
                id               as "id!: Uuid",
                task_attempt_id  as "task_attempt_id!: Uuid",
                prompt           as "prompt!: String",
                queued           as "queued!: bool",
                sending          as "sending!: bool",
                variant,
                image_ids        as "image_ids?: String",
                created_at       as "created_at!: DateTime<Utc>",
                updated_at       as "updated_at!: DateTime<Utc>",
                version          as "version!: i64"
              FROM follow_up_drafts
             WHERE task_attempt_id = $1"#,
            task_attempt_id
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.map(FollowUpDraft::from))
    }

    pub async fn upsert(
        pool: &SqlitePool,
        data: &UpsertFollowUpDraft,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        {
            let image_ids_json = data
                .image_ids
                .as_ref()
                .map(|ids| serde_json::to_string(ids).unwrap_or_else(|_| "[]".to_string()));

            sqlx::query_as!(
                FollowUpDraftRow,
                r#"INSERT INTO follow_up_drafts (id, task_attempt_id, prompt, queued, variant, image_ids)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT(task_attempt_id) DO UPDATE SET
                     prompt = excluded.prompt,
                     queued = excluded.queued,
                     variant = excluded.variant,
                     image_ids = excluded.image_ids
                   RETURNING 
                    id               as "id!: Uuid",
                    task_attempt_id  as "task_attempt_id!: Uuid",
                    prompt           as "prompt!: String",
                    queued           as "queued!: bool",
                    sending          as "sending!: bool",
                    variant,
                    image_ids        as "image_ids?: String",
                   created_at       as "created_at!: DateTime<Utc>",
                    updated_at       as "updated_at!: DateTime<Utc>",
                    version          as "version!: i64""#,
                id,
                data.task_attempt_id,
                data.prompt,
                data.queued,
                data.variant,
                image_ids_json
            )
            .fetch_one(pool)
            .await
            .map(FollowUpDraft::from)
        }
    }

    pub async fn clear_after_send(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE follow_up_drafts 
               SET prompt = '', queued = 0, sending = 0, image_ids = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE task_attempt_id = $1"#,
            task_attempt_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Attempt to atomically mark this draft as "sending" if it's currently queued and non-empty.
    /// Returns true if the row was updated (we acquired the send lock), false otherwise.
    pub async fn try_mark_sending(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE follow_up_drafts
               SET sending = 1, updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE task_attempt_id = $1
               AND queued = 1
               AND sending = 0
               AND TRIM(prompt) != ''"#,
            task_attempt_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
