use std::str::FromStr;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DraftType {
    FollowUp,
    Retry,
}

impl DraftType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DraftType::FollowUp => "follow_up",
            DraftType::Retry => "retry",
        }
    }
}

impl FromStr for DraftType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "follow_up" => Ok(DraftType::FollowUp),
            "retry" => Ok(DraftType::Retry),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Draft {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub draft_type: DraftType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_process_id: Option<Uuid>,
    pub prompt: String,
    pub queued: bool,
    pub sending: bool,
    pub variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_ids: Option<Vec<Uuid>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: i64,
}

#[derive(Debug, Clone, FromRow)]
struct DraftRow {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub draft_type: String,
    pub retry_process_id: Option<Uuid>,
    pub prompt: String,
    pub queued: bool,
    pub sending: bool,
    pub variant: Option<String>,
    pub image_ids: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: i64,
}

impl From<DraftRow> for Draft {
    fn from(r: DraftRow) -> Self {
        let image_ids = r
            .image_ids
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<Uuid>>(s).ok());
        Draft {
            id: r.id,
            task_attempt_id: r.task_attempt_id,
            draft_type: DraftType::from_str(&r.draft_type).unwrap_or(DraftType::FollowUp),
            retry_process_id: r.retry_process_id,
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
pub struct UpsertDraft {
    pub task_attempt_id: Uuid,
    pub draft_type: DraftType,
    pub retry_process_id: Option<Uuid>,
    pub prompt: String,
    pub queued: bool,
    pub variant: Option<String>,
    pub image_ids: Option<Vec<Uuid>>,
}

impl Draft {
    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            DraftRow,
            r#"SELECT
                id                       as "id!: Uuid",
                task_attempt_id          as "task_attempt_id!: Uuid",
                draft_type,
                retry_process_id         as "retry_process_id?: Uuid",
                prompt,
                queued                   as "queued!: bool",
                sending                  as "sending!: bool",
                variant,
                image_ids,
                created_at               as "created_at!: DateTime<Utc>",
                updated_at               as "updated_at!: DateTime<Utc>",
                version                  as "version!: i64"
              FROM drafts
             WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.map(Draft::from))
    }

    pub async fn find_by_task_attempt_and_type(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<Option<Self>, sqlx::Error> {
        let draft_type_str = draft_type.as_str();
        sqlx::query_as!(
            DraftRow,
            r#"SELECT
                id                       as "id!: Uuid",
                task_attempt_id          as "task_attempt_id!: Uuid",
                draft_type,
                retry_process_id         as "retry_process_id?: Uuid",
                prompt,
                queued                   as "queued!: bool",
                sending                  as "sending!: bool",
                variant,
                image_ids,
                created_at               as "created_at!: DateTime<Utc>",
                updated_at               as "updated_at!: DateTime<Utc>",
                version                  as "version!: i64"
              FROM drafts
             WHERE task_attempt_id = $1 AND draft_type = $2"#,
            task_attempt_id,
            draft_type_str
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.map(Draft::from))
    }

    pub async fn upsert(pool: &SqlitePool, data: &UpsertDraft) -> Result<Self, sqlx::Error> {
        // Validate retry_process_id requirement
        if data.draft_type == DraftType::Retry && data.retry_process_id.is_none() {
            return Err(sqlx::Error::Protocol(
                "retry_process_id is required for retry drafts".into(),
            ));
        }

        let id = Uuid::new_v4();
        let image_ids_json = data
            .image_ids
            .as_ref()
            .map(|ids| serde_json::to_string(ids).unwrap_or_else(|_| "[]".to_string()));
        let draft_type_str = data.draft_type.as_str();
        let prompt = data.prompt.clone();
        let variant = data.variant.clone();
        sqlx::query_as!(
            DraftRow,
            r#"INSERT INTO drafts (id, task_attempt_id, draft_type, retry_process_id, prompt, queued, variant, image_ids)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT(task_attempt_id, draft_type) DO UPDATE SET
                 retry_process_id = excluded.retry_process_id,
                 prompt = excluded.prompt,
                 queued = excluded.queued,
                 variant = excluded.variant,
                 image_ids = excluded.image_ids,
                 version = drafts.version + 1
               RETURNING
                 id                       as "id!: Uuid",
                 task_attempt_id          as "task_attempt_id!: Uuid",
                 draft_type,
                 retry_process_id         as "retry_process_id?: Uuid",
                 prompt,
                 queued                   as "queued!: bool",
                 sending                  as "sending!: bool",
                 variant,
                 image_ids,
                 created_at               as "created_at!: DateTime<Utc>",
                 updated_at               as "updated_at!: DateTime<Utc>",
                 version                  as "version!: i64""#,
            id,
            data.task_attempt_id,
            draft_type_str,
            data.retry_process_id,
            prompt,
            data.queued,
            variant,
            image_ids_json
        )
        .fetch_one(pool)
        .await
        .map(Draft::from)
    }

    pub async fn clear_after_send(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<(), sqlx::Error> {
        let draft_type_str = draft_type.as_str();

        match draft_type {
            DraftType::FollowUp => {
                // Follow-up drafts: update to empty
                sqlx::query(
                    r#"UPDATE drafts
                       SET prompt = '', queued = 0, sending = 0, image_ids = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1
                     WHERE task_attempt_id = ? AND draft_type = ?"#,
                )
                .bind(task_attempt_id)
                .bind(draft_type_str)
                .execute(pool)
                .await?;
            }
            DraftType::Retry => {
                // Retry drafts: delete the record
                Self::delete_by_task_attempt_and_type(pool, task_attempt_id, draft_type).await?;
            }
        }
        Ok(())
    }

    pub async fn delete_by_task_attempt_and_type(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(r#"DELETE FROM drafts WHERE task_attempt_id = ? AND draft_type = ?"#)
            .bind(task_attempt_id)
            .bind(draft_type.as_str())
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Attempt to atomically mark this draft as "sending" if it's currently queued and non-empty.
    /// Returns true if the row was updated (we acquired the send lock), false otherwise.
    pub async fn try_mark_sending(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        draft_type: DraftType,
    ) -> Result<bool, sqlx::Error> {
        let draft_type_str = draft_type.as_str();
        let result = sqlx::query(
            r#"UPDATE drafts
               SET sending = 1, updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE task_attempt_id = ?
               AND draft_type = ?
               AND queued = 1
               AND sending = 0
               AND TRIM(prompt) != ''"#,
        )
        .bind(task_attempt_id)
        .bind(draft_type_str)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Partial update on a draft by attempt and type. Updates only provided fields
    /// and bumps `updated_at` and `version` when any change occurs.
    pub async fn update_partial(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        draft_type: DraftType,
        prompt: Option<String>,
        variant: Option<Option<String>>,
        image_ids: Option<Vec<Uuid>>,
        retry_process_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        if retry_process_id.is_none()
            && prompt.is_none()
            && variant.is_none()
            && image_ids.is_none()
        {
            return Ok(());
        }
        let mut query = QueryBuilder::<Sqlite>::new("UPDATE drafts SET ");

        let mut separated = query.separated(", ");
        if let Some(rpid) = retry_process_id {
            separated.push("retry_process_id = ");
            separated.push_bind_unseparated(rpid);
        }
        if let Some(p) = prompt {
            separated.push("prompt = ");
            separated.push_bind_unseparated(p);
        }
        if let Some(v_opt) = variant {
            separated.push("variant = ");
            match v_opt {
                Some(v) => separated.push_bind_unseparated(v),
                None => separated.push_bind_unseparated(Option::<String>::None),
            };
        }
        if let Some(ids) = image_ids {
            let image_ids_json = serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string());
            separated.push("image_ids = ");
            separated.push_bind_unseparated(image_ids_json);
        }
        separated.push("updated_at = CURRENT_TIMESTAMP");
        separated.push("version = version + 1");

        query.push(" WHERE task_attempt_id = ");
        query.push_bind(task_attempt_id);
        query.push(" AND draft_type = ");
        query.push_bind(draft_type.as_str());
        query.build().execute(pool).await?;
        Ok(())
    }

    /// Set queued flag (and bump metadata) for a draft by attempt and type.
    pub async fn set_queued(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        draft_type: DraftType,
        queued: bool,
        expected_queued: Option<bool>,
        expected_version: Option<i64>,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"UPDATE drafts
                   SET queued = CASE
                                   WHEN ?1 THEN (TRIM(prompt) <> '')
                                   ELSE 0
                                 END,
                       updated_at = CURRENT_TIMESTAMP,
                       version    = version + 1
                 WHERE task_attempt_id = ?2
                   AND draft_type      = ?3
                   AND (?4 IS NULL OR queued  = ?4)
                   AND (?5 IS NULL OR version = ?5)"#,
        )
        .bind(queued as i64)
        .bind(task_attempt_id)
        .bind(draft_type.as_str())
        .bind(expected_queued.map(|value| value as i64))
        .bind(expected_version)
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
