use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct CodingAgentTurn {
    pub id: Uuid,
    pub execution_process_id: Uuid,
    pub agent_session_id: Option<String>,
    pub agent_message_id: Option<String>,
    pub prompt: Option<String>,  // The prompt sent to the executor
    pub summary: Option<String>, // Final assistant message/summary
    pub seen: bool,              // Whether user has viewed this turn
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateCodingAgentTurn {
    pub execution_process_id: Uuid,
    pub prompt: Option<String>,
}

/// Session info from a coding agent turn, used for follow-up requests
#[derive(Debug)]
pub struct CodingAgentResumeInfo {
    pub session_id: String,
    pub message_id: Option<String>,
}

impl CodingAgentTurn {
    /// Find session info from the latest coding agent turn for a session.
    /// Only returns turns that have an agent_session_id set.
    pub async fn find_latest_session_info(
        pool: &SqlitePool,
        session_id: Uuid,
    ) -> Result<Option<CodingAgentResumeInfo>, sqlx::Error> {
        sqlx::query_as!(
            CodingAgentResumeInfo,
            r#"SELECT
                cat.agent_session_id as "session_id!",
                cat.agent_message_id as "message_id"
               FROM execution_processes ep
               JOIN coding_agent_turns cat ON ep.id = cat.execution_process_id
               WHERE ep.session_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND ep.dropped = FALSE
                 AND cat.agent_session_id IS NOT NULL
               ORDER BY ep.created_at DESC
               LIMIT 1"#,
            session_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find coding agent turn by execution process ID
    pub async fn find_by_execution_process_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CodingAgentTurn,
            r#"SELECT
                id as "id!: Uuid",
                execution_process_id as "execution_process_id!: Uuid",
                agent_session_id,
                agent_message_id,
                prompt,
                summary,
                seen as "seen!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM coding_agent_turns
               WHERE execution_process_id = $1"#,
            execution_process_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_agent_session_id(
        pool: &SqlitePool,
        agent_session_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CodingAgentTurn,
            r#"SELECT
                id as "id!: Uuid",
                execution_process_id as "execution_process_id!: Uuid",
                agent_session_id,
                agent_message_id,
                prompt,
                summary,
                seen as "seen!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM coding_agent_turns
               WHERE agent_session_id = ?
               ORDER BY updated_at DESC
               LIMIT 1"#,
            agent_session_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new coding agent turn
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateCodingAgentTurn,
        id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();

        tracing::debug!(
            "Creating coding agent turn: id={}, execution_process_id={}, agent_session_id=None (will be set later)",
            id,
            data.execution_process_id
        );

        sqlx::query_as!(
            CodingAgentTurn,
            r#"INSERT INTO coding_agent_turns (
                id, execution_process_id, agent_session_id, agent_message_id, prompt, summary, seen,
                created_at, updated_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING
                id as "id!: Uuid",
                execution_process_id as "execution_process_id!: Uuid",
                agent_session_id,
                agent_message_id,
                prompt,
                summary,
                seen as "seen!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.execution_process_id,
            None::<String>, // agent_session_id initially None until parsed from output
            None::<String>, // agent_message_id initially None until parsed from output
            data.prompt,
            None::<String>, // summary initially None
            false,          // seen - defaults to unseen
            now,            // created_at
            now             // updated_at
        )
        .fetch_one(pool)
        .await
    }

    /// Update coding agent turn with agent session ID
    pub async fn update_agent_session_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        agent_session_id: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET agent_session_id = $1, updated_at = $2
               WHERE execution_process_id = $3"#,
            agent_session_id,
            now,
            execution_process_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update coding agent turn with agent message ID (for --resume-session-at)
    pub async fn update_agent_message_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        agent_message_id: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET agent_message_id = $1, updated_at = $2
               WHERE execution_process_id = $3"#,
            agent_message_id,
            now,
            execution_process_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update coding agent turn summary
    pub async fn update_summary(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        summary: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET summary = $1, updated_at = $2
               WHERE execution_process_id = $3"#,
            summary,
            now,
            execution_process_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Mark all coding agent turns for a workspace as seen
    pub async fn mark_seen_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET seen = 1, updated_at = $1
               WHERE execution_process_id IN (
                   SELECT ep.id FROM execution_processes ep
                   JOIN sessions s ON ep.session_id = s.id
                   WHERE s.workspace_id = $2
               ) AND seen = 0"#,
            now,
            workspace_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Check if a workspace has any unseen coding agent turns
    pub async fn has_unseen_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                SELECT 1 FROM coding_agent_turns cat
                JOIN execution_processes ep ON cat.execution_process_id = ep.id
                JOIN sessions s ON ep.session_id = s.id
                WHERE s.workspace_id = $1 AND cat.seen = 0
            ) as "has_unseen!: bool""#,
            workspace_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }

    /// Find all workspaces that have unseen coding agent turns, filtered by archived status
    pub async fn find_workspaces_with_unseen(
        pool: &SqlitePool,
        archived: bool,
    ) -> Result<std::collections::HashSet<Uuid>, sqlx::Error> {
        let result: Vec<Uuid> = sqlx::query_scalar!(
            r#"SELECT DISTINCT s.workspace_id as "workspace_id!: Uuid"
               FROM coding_agent_turns cat
               JOIN execution_processes ep ON cat.execution_process_id = ep.id
               JOIN sessions s ON ep.session_id = s.id
               JOIN workspaces w ON s.workspace_id = w.id
               WHERE cat.seen = 0 AND w.archived = $1"#,
            archived
        )
        .fetch_all(pool)
        .await?;

        Ok(result.into_iter().collect())
    }
}
