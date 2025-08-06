use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use utils::log_msg::LogMsg;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExecutionProcessLogs {
    pub execution_id: Uuid,
    pub logs: String, // JSONL format
    pub byte_size: i64,
    pub inserted_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateExecutionProcessLogs {
    pub execution_id: Uuid,
    pub logs: String,
    pub byte_size: i64,
}

impl ExecutionProcessLogs {
    /// Find logs by execution process ID
    pub async fn find_by_execution_id(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcessLogs,
            r#"SELECT 
                execution_id as "execution_id!: Uuid",
                logs,
                byte_size,
                inserted_at as "inserted_at!: DateTime<Utc>"
               FROM execution_process_logs 
               WHERE execution_id = $1"#,
            execution_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create or update execution process logs
    pub async fn upsert(
        pool: &SqlitePool,
        data: &CreateExecutionProcessLogs,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();

        sqlx::query_as!(
            ExecutionProcessLogs,
            r#"INSERT INTO execution_process_logs (execution_id, logs, byte_size, inserted_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (execution_id) DO UPDATE
               SET logs = EXCLUDED.logs, 
                   byte_size = EXCLUDED.byte_size,
                   inserted_at = EXCLUDED.inserted_at
               RETURNING 
                execution_id as "execution_id!: Uuid",
                logs,
                byte_size,
                inserted_at as "inserted_at!: DateTime<Utc>""#,
            data.execution_id,
            data.logs,
            data.byte_size,
            now
        )
        .fetch_one(pool)
        .await
    }

    /// Parse JSONL logs back into Vec<LogMsg>
    pub fn parse_logs(&self) -> Result<Vec<LogMsg>, serde_json::Error> {
        let mut messages = Vec::new();
        for line in self.logs.lines() {
            if !line.trim().is_empty() {
                let msg: LogMsg = serde_json::from_str(line)?;
                messages.push(msg);
            }
        }
        Ok(messages)
    }

    /// Convert Vec<LogMsg> to JSONL format
    pub fn serialize_logs(messages: &[LogMsg]) -> Result<String, serde_json::Error> {
        let mut jsonl = String::new();
        for msg in messages {
            let line = serde_json::to_string(msg)?;
            jsonl.push_str(&line);
            jsonl.push('\n');
        }
        Ok(jsonl)
    }

    /// Append a JSONL line to the logs for an execution process
    pub async fn append_log_line(
        pool: &SqlitePool,
        execution_id: Uuid,
        jsonl_line: &str,
    ) -> Result<(), sqlx::Error> {
        let byte_size = jsonl_line.len() as i64;
        sqlx::query!(
            r#"INSERT INTO execution_process_logs (execution_id, logs, byte_size, inserted_at)
               VALUES ($1, $2, $3, datetime('now', 'subsec'))
               ON CONFLICT (execution_id) DO UPDATE
               SET logs = logs || $2,
                   byte_size = byte_size + $3,
                   inserted_at = datetime('now', 'subsec')"#,
            execution_id,
            jsonl_line,
            byte_size
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}
