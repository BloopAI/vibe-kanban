use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use utils::log_msg::LogMsg;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ExecutionProcessLogs {
    pub execution_id: Uuid,
    pub logs: String, // JSONL format
    pub byte_size: i64,
    pub inserted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ExecutionProcessLogMigrationInfo {
    pub execution_id: Uuid,
    pub session_id: Uuid,
}

impl ExecutionProcessLogs {
    /// Check if there are any log records
    pub async fn has_any(pool: &SqlitePool) -> Result<bool, sqlx::Error> {
        let result: Option<i64> =
            match sqlx::query_scalar("SELECT 1 FROM execution_process_logs LIMIT 1")
                .fetch_optional(pool)
                .await
            {
                Ok(r) => r,
                Err(sqlx::Error::Database(e)) if e.message().contains("no such table") => {
                    return Ok(false);
                }
                Err(e) => return Err(e),
            };
        Ok(result.is_some())
    }

    /// Count the total number of distinct execution processes that have logs
    pub async fn count_distinct_processes(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(id)
            FROM execution_processes ep
            WHERE EXISTS (
                SELECT 1 FROM execution_process_logs epl WHERE epl.execution_id = ep.id
            )
            "#,
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    /// Get a stream of distinct execution processes that have logs
    pub fn stream_distinct_processes<'a>(
        pool: &'a SqlitePool,
    ) -> futures::stream::BoxStream<'a, Result<ExecutionProcessLogMigrationInfo, sqlx::Error>> {
        sqlx::query_as!(
            ExecutionProcessLogMigrationInfo,
            r#"
            SELECT 
                ep.id as "execution_id!: Uuid", 
                ep.session_id as "session_id!: Uuid"
            FROM execution_processes ep
            WHERE EXISTS (
                SELECT 1 FROM execution_process_logs epl WHERE epl.execution_id = ep.id
            )
            "#
        )
        .fetch(pool)
    }

    /// Delete all records in execution_process_logs
    pub async fn delete_all(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM execution_process_logs")
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Find logs by execution process ID
    pub async fn find_by_execution_id(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcessLogs,
            r#"SELECT 
                execution_id as "execution_id!: Uuid",
                logs,
                byte_size,
                inserted_at as "inserted_at!: DateTime<Utc>"
               FROM execution_process_logs 
               WHERE execution_id = $1
               ORDER BY inserted_at ASC"#,
            execution_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find logs by execution process ID as a stream of strings
    pub fn stream_log_lines_by_execution_id<'a>(
        pool: &'a SqlitePool,
        execution_id: &'a Uuid,
    ) -> futures::stream::BoxStream<'a, Result<String, sqlx::Error>> {
        sqlx::query_scalar!(
            r#"SELECT logs
               FROM execution_process_logs 
               WHERE execution_id = $1
               ORDER BY inserted_at ASC"#,
            *execution_id
        )
        .fetch(pool)
    }

    /// Parse JSONL logs back into Vec<LogMsg>
    pub fn parse_logs(records: &[Self]) -> Result<Vec<LogMsg>, serde_json::Error> {
        let mut messages = Vec::new();
        for line in records.iter().flat_map(|record| record.logs.lines()) {
            if !line.trim().is_empty() {
                let msg: LogMsg = serde_json::from_str(line)?;
                messages.push(msg);
            }
        }
        Ok(messages)
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
               VALUES ($1, $2, $3, datetime('now', 'subsec'))"#,
            execution_id,
            jsonl_line,
            byte_size
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}
