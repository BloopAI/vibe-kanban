//! DB-side model for the Cursor MCP **lobby** (v4).
//!
//! See `migrations/20260421000000_cursor_mcp_lobby.sql` for the schema and
//! design intent.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

/// Maximum bytes of `first_message` we persist for the lobby preview.
pub const FIRST_MESSAGE_PREVIEW_BYTES: usize = 1024;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct CursorMcpLobbySession {
    pub bridge_session_id: String,
    pub bridge_label: Option<String>,
    pub title: Option<String>,
    pub first_message: Option<String>,
    pub last_activity_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    /// `Some(vk_session_id)` once the user has "adopted" this lobby
    /// conversation into a vibe-kanban workspace. Once set, the lobby
    /// row is effectively read-only and the session no longer appears in
    /// the picker (filtered by the `idx_cursor_mcp_lobby_unadopted`
    /// index for fast queries).
    pub adopted_into_session_id: Option<Uuid>,
}

impl CursorMcpLobbySession {
    /// Insert a new row, or update its `last_activity_at` (and optional
    /// metadata) if the bridge_session_id already exists. Idempotent.
    /// Never overwrites `adopted_into_session_id` once set.
    pub async fn upsert_first_seen(
        pool: &SqlitePool,
        bridge_session_id: &str,
        bridge_label: Option<&str>,
        title: Option<&str>,
        first_message: &str,
    ) -> Result<Self, sqlx::Error> {
        let preview = truncate_to_bytes(first_message, FIRST_MESSAGE_PREVIEW_BYTES);
        sqlx::query_as!(
            CursorMcpLobbySession,
            r#"INSERT INTO cursor_mcp_lobby_sessions
                   (bridge_session_id, bridge_label, title, first_message)
               VALUES (?1, ?2, ?3, ?4)
               ON CONFLICT(bridge_session_id) DO UPDATE SET
                   last_activity_at = datetime('now'),
                   bridge_label = COALESCE(excluded.bridge_label, bridge_label),
                   title        = COALESCE(excluded.title,        title)
               RETURNING
                   bridge_session_id        AS "bridge_session_id!: String",
                   bridge_label,
                   title,
                   first_message,
                   last_activity_at         AS "last_activity_at!: DateTime<Utc>",
                   created_at               AS "created_at!: DateTime<Utc>",
                   adopted_into_session_id  AS "adopted_into_session_id?: Uuid""#,
            bridge_session_id,
            bridge_label,
            title,
            preview,
        )
        .fetch_one(pool)
        .await
    }

    /// Touch the activity timestamp without changing anything else.
    pub async fn touch(pool: &SqlitePool, bridge_session_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE cursor_mcp_lobby_sessions
               SET last_activity_at = datetime('now')
               WHERE bridge_session_id = ?1"#,
            bridge_session_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Fetch one row by primary key (regardless of adoption status).
    pub async fn find(
        pool: &SqlitePool,
        bridge_session_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CursorMcpLobbySession,
            r#"SELECT
                   bridge_session_id        AS "bridge_session_id!: String",
                   bridge_label,
                   title,
                   first_message,
                   last_activity_at         AS "last_activity_at!: DateTime<Utc>",
                   created_at               AS "created_at!: DateTime<Utc>",
                   adopted_into_session_id  AS "adopted_into_session_id?: Uuid"
               FROM cursor_mcp_lobby_sessions
               WHERE bridge_session_id = ?1"#,
            bridge_session_id
        )
        .fetch_optional(pool)
        .await
    }

    /// All rows that have NOT been adopted yet, newest activity first.
    /// Used by the lobby picker.
    pub async fn list_unadopted(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            CursorMcpLobbySession,
            r#"SELECT
                   bridge_session_id        AS "bridge_session_id!: String",
                   bridge_label,
                   title,
                   first_message,
                   last_activity_at         AS "last_activity_at!: DateTime<Utc>",
                   created_at               AS "created_at!: DateTime<Utc>",
                   adopted_into_session_id  AS "adopted_into_session_id?: Uuid"
               FROM cursor_mcp_lobby_sessions
               WHERE adopted_into_session_id IS NULL
               ORDER BY last_activity_at DESC"#,
        )
        .fetch_all(pool)
        .await
    }

    /// Mark this lobby entry as adopted into a vk session. Returns the
    /// updated row. Errors with `RowNotFound` if the bridge_session_id
    /// doesn't exist; with a custom error if it's already adopted (to
    /// prevent double-adoption).
    pub async fn adopt(
        pool: &SqlitePool,
        bridge_session_id: &str,
        vk_session_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let updated = sqlx::query_as!(
            CursorMcpLobbySession,
            r#"UPDATE cursor_mcp_lobby_sessions
               SET adopted_into_session_id = ?1,
                   last_activity_at = datetime('now')
               WHERE bridge_session_id = ?2
                 AND adopted_into_session_id IS NULL
               RETURNING
                   bridge_session_id        AS "bridge_session_id!: String",
                   bridge_label,
                   title,
                   first_message,
                   last_activity_at         AS "last_activity_at!: DateTime<Utc>",
                   created_at               AS "created_at!: DateTime<Utc>",
                   adopted_into_session_id  AS "adopted_into_session_id?: Uuid""#,
            vk_session_id,
            bridge_session_id,
        )
        .fetch_optional(pool)
        .await?;
        updated.ok_or(sqlx::Error::RowNotFound)
    }

    /// Delete a lobby entry (manual cleanup from the picker). Allowed
    /// regardless of adoption status — adopted rows are mostly bookkeeping
    /// at that point.
    pub async fn delete(pool: &SqlitePool, bridge_session_id: &str) -> Result<u64, sqlx::Error> {
        let res = sqlx::query!(
            "DELETE FROM cursor_mcp_lobby_sessions WHERE bridge_session_id = ?1",
            bridge_session_id
        )
        .execute(pool)
        .await?;
        Ok(res.rows_affected())
    }

    /// Lookup the lobby row's `bridge_session_id` for a vk session that
    /// already adopted this conversation. Used when the in-memory
    /// `vk_to_bridge` map is cold (process restart before rehydrate,
    /// or a rare routing race) so the UI banner and `/resolve` can
    /// still find the correct bridge id.
    pub async fn find_bridge_for_vk_session(
        pool: &SqlitePool,
        vk_session_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let row = sqlx::query!(
            r#"SELECT bridge_session_id AS "bridge_session_id!: String"
               FROM cursor_mcp_lobby_sessions
               WHERE adopted_into_session_id = ?1
               LIMIT 1"#,
            vk_session_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(row.map(|r| r.bridge_session_id))
    }

    /// All currently-adopted bridge → vk session mappings. Used at backend
    /// startup to rehydrate the in-memory routing table so a restart
    /// doesn't break sessions Cursor's LLM is still reusing.
    pub async fn list_adopted(pool: &SqlitePool) -> Result<Vec<(String, Uuid)>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT
                   bridge_session_id        AS "bridge_session_id!: String",
                   adopted_into_session_id  AS "adopted_into_session_id!: Uuid"
               FROM cursor_mcp_lobby_sessions
               WHERE adopted_into_session_id IS NOT NULL"#
        )
        .fetch_all(pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| (r.bridge_session_id, r.adopted_into_session_id))
            .collect())
    }
}

fn truncate_to_bytes(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    // Walk char boundaries so we never split a codepoint.
    let mut end = max;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    let mut out = s[..end].to_string();
    out.push('…');
    out
}
