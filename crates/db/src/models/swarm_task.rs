use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "swarm_task_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum SwarmTaskStatus {
    #[default]
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "task_priority", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum TaskPriority {
    Low,
    #[default]
    Medium,
    High,
    Urgent,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SwarmTask {
    pub id: Uuid,
    pub swarm_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: SwarmTaskStatus,
    pub priority: TaskPriority,
    pub sandbox_id: Option<String>,
    pub depends_on: Option<Vec<Uuid>>,
    pub triggers_after: Option<Vec<Uuid>>,
    pub result: Option<String>,
    pub error: Option<String>,
    pub tags: Vec<String>,
    #[ts(type = "Date | null")]
    pub started_at: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub completed_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateSwarmTask {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<TaskPriority>,
    pub depends_on: Option<Vec<Uuid>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateSwarmTask {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<SwarmTaskStatus>,
    pub priority: Option<TaskPriority>,
    pub sandbox_id: Option<String>,
    pub depends_on: Option<Vec<Uuid>>,
    pub triggers_after: Option<Vec<Uuid>>,
    pub result: Option<String>,
    pub error: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl SwarmTask {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let status_str: String = row.try_get("status")?;
        let status = status_str.parse::<SwarmTaskStatus>().unwrap_or_default();

        let priority_str: String = row.try_get("priority")?;
        let priority = priority_str.parse::<TaskPriority>().unwrap_or_default();

        // Parse JSON arrays
        let depends_on: Option<Vec<Uuid>> = row
            .try_get::<Option<String>, _>("depends_on")?
            .and_then(|s| serde_json::from_str(&s).ok());

        let triggers_after: Option<Vec<Uuid>> = row
            .try_get::<Option<String>, _>("triggers_after")?
            .and_then(|s| serde_json::from_str(&s).ok());

        let tags: Vec<String> = row
            .try_get::<Option<String>, _>("tags")?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        Ok(Self {
            id: row.try_get("id")?,
            swarm_id: row.try_get("swarm_id")?,
            title: row.try_get("title")?,
            description: row.try_get("description")?,
            status,
            priority,
            sandbox_id: row.try_get("sandbox_id")?,
            depends_on,
            triggers_after,
            result: row.try_get("result")?,
            error: row.try_get("error")?,
            tags,
            started_at: row.try_get("started_at")?,
            completed_at: row.try_get("completed_at")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, swarm_id, title, description, status, priority, sandbox_id,
                    depends_on, triggers_after, result, error, tags,
                    started_at, completed_at, created_at, updated_at
             FROM swarm_tasks
             ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, swarm_id, title, description, status, priority, sandbox_id,
                    depends_on, triggers_after, result, error, tags,
                    started_at, completed_at, created_at, updated_at
             FROM swarm_tasks
             WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::from_row).transpose()
    }

    /// Find multiple tasks by their IDs in a single query (avoids N+1)
    pub async fn find_by_ids(pool: &SqlitePool, ids: &[Uuid]) -> Result<Vec<Self>, sqlx::Error> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        // Build placeholders for IN clause: $1, $2, $3, ...
        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("${}", i)).collect();
        let placeholders_str = placeholders.join(", ");

        let query = format!(
            "SELECT id, swarm_id, title, description, status, priority, sandbox_id,
                    depends_on, triggers_after, result, error, tags,
                    started_at, completed_at, created_at, updated_at
             FROM swarm_tasks
             WHERE id IN ({})",
            placeholders_str
        );

        let mut query_builder = sqlx::query(&query);
        for id in ids {
            query_builder = query_builder.bind(id);
        }

        let rows = query_builder.fetch_all(pool).await?;
        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_by_swarm_id(pool: &SqlitePool, swarm_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, swarm_id, title, description, status, priority, sandbox_id,
                    depends_on, triggers_after, result, error, tags,
                    started_at, completed_at, created_at, updated_at
             FROM swarm_tasks
             WHERE swarm_id = $1
             ORDER BY created_at DESC"
        )
        .bind(swarm_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn find_pending_by_swarm_id(pool: &SqlitePool, swarm_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT id, swarm_id, title, description, status, priority, sandbox_id,
                    depends_on, triggers_after, result, error, tags,
                    started_at, completed_at, created_at, updated_at
             FROM swarm_tasks
             WHERE swarm_id = $1 AND status = 'pending'
             ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                END,
                created_at ASC"
        )
        .bind(swarm_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::from_row).collect()
    }

    pub async fn create(pool: &SqlitePool, swarm_id: Uuid, data: &CreateSwarmTask, task_id: Uuid) -> Result<Self, sqlx::Error> {
        let priority = data.priority.clone().unwrap_or_default();
        let priority_str = priority.to_string();

        let depends_on_json = data.depends_on.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()));

        let tags_json = data.tags.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| "[]".to_string());

        let row = sqlx::query(
            "INSERT INTO swarm_tasks (id, swarm_id, title, description, priority, depends_on, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, swarm_id, title, description, status, priority, sandbox_id,
                       depends_on, triggers_after, result, error, tags,
                       started_at, completed_at, created_at, updated_at"
        )
        .bind(task_id)
        .bind(swarm_id)
        .bind(&data.title)
        .bind(&data.description)
        .bind(&priority_str)
        .bind(&depends_on_json)
        .bind(&tags_json)
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn update(pool: &SqlitePool, id: Uuid, data: &UpdateSwarmTask) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let title = data.title.clone().unwrap_or(existing.title);
        let description = data.description.clone().or(existing.description);
        let status = data.status.clone().unwrap_or(existing.status);
        let status_str = status.to_string();
        let priority = data.priority.clone().unwrap_or(existing.priority);
        let priority_str = priority.to_string();
        let sandbox_id = data.sandbox_id.clone().or(existing.sandbox_id);
        let result = data.result.clone().or(existing.result);
        let error = data.error.clone().or(existing.error);

        let depends_on_json = data.depends_on.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
            .or_else(|| existing.depends_on.as_ref().map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string())));

        let triggers_after_json = data.triggers_after.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
            .or_else(|| existing.triggers_after.as_ref().map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string())));

        let tags_json = data.tags.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| serde_json::to_string(&existing.tags).unwrap_or_else(|_| "[]".to_string()));

        let row = sqlx::query(
            "UPDATE swarm_tasks
             SET title = $2, description = $3, status = $4, priority = $5,
                 sandbox_id = $6, depends_on = $7, triggers_after = $8,
                 result = $9, error = $10, tags = $11, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, swarm_id, title, description, status, priority, sandbox_id,
                       depends_on, triggers_after, result, error, tags,
                       started_at, completed_at, created_at, updated_at"
        )
        .bind(id)
        .bind(&title)
        .bind(&description)
        .bind(&status_str)
        .bind(&priority_str)
        .bind(&sandbox_id)
        .bind(&depends_on_json)
        .bind(&triggers_after_json)
        .bind(&result)
        .bind(&error)
        .bind(&tags_json)
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn update_status(pool: &SqlitePool, id: Uuid, status: SwarmTaskStatus) -> Result<(), sqlx::Error> {
        let status_str = status.to_string();

        // Set started_at when transitioning to running
        if status == SwarmTaskStatus::Running {
            sqlx::query(
                "UPDATE swarm_tasks
                 SET status = $2, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1"
            )
            .bind(id)
            .bind(&status_str)
            .execute(pool)
            .await?;
        }
        // Set completed_at when transitioning to completed, failed, or cancelled
        else if matches!(status, SwarmTaskStatus::Completed | SwarmTaskStatus::Failed | SwarmTaskStatus::Cancelled) {
            sqlx::query(
                "UPDATE swarm_tasks
                 SET status = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1"
            )
            .bind(id)
            .bind(&status_str)
            .execute(pool)
            .await?;
        } else {
            sqlx::query(
                "UPDATE swarm_tasks SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
            )
            .bind(id)
            .bind(&status_str)
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    pub async fn set_result(pool: &SqlitePool, id: Uuid, result: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks SET result = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
        )
        .bind(id)
        .bind(result)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn set_error(pool: &SqlitePool, id: Uuid, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks SET error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
        )
        .bind(id)
        .bind(error)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn assign_sandbox(pool: &SqlitePool, id: Uuid, sandbox_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks SET sandbox_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
        )
        .bind(id)
        .bind(sandbox_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM swarm_tasks WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_swarm_id(pool: &SqlitePool, swarm_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM swarm_tasks WHERE swarm_id = $1")
            .bind(swarm_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Start a task - set status to running, assign sandbox, set started_at
    pub async fn start_task(pool: &SqlitePool, id: Uuid, sandbox_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks
             SET status = 'running', sandbox_id = $2, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1"
        )
        .bind(id)
        .bind(sandbox_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Complete a task - set status to completed, save result, set completed_at
    pub async fn complete_task(pool: &SqlitePool, id: Uuid, result: Option<&str>) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks
             SET status = 'completed', result = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1"
        )
        .bind(id)
        .bind(result)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Fail a task - set status to failed, save error, set completed_at
    pub async fn fail_task(pool: &SqlitePool, id: Uuid, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks
             SET status = 'failed', error = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1"
        )
        .bind(id)
        .bind(error)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Release sandbox from task - clear sandbox_id
    pub async fn release_sandbox(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks SET sandbox_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1"
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Check if all task dependencies are complete
    /// Uses a single query to fetch all dependencies (avoids N+1 problem)
    pub async fn are_dependencies_complete(pool: &SqlitePool, task: &SwarmTask) -> Result<bool, sqlx::Error> {
        let depends_on = match &task.depends_on {
            Some(deps) if !deps.is_empty() => deps,
            _ => return Ok(true),
        };

        // Fetch all dependency tasks in a single query
        let dep_tasks = Self::find_by_ids(pool, depends_on).await?;

        // If we didn't find all dependencies, some are missing - consider incomplete
        if dep_tasks.len() != depends_on.len() {
            return Ok(false);
        }

        // Check if all found tasks are completed
        Ok(dep_tasks.iter().all(|t| t.status == SwarmTaskStatus::Completed))
    }

    /// Retry a failed task - reset status to pending, clear error/result/sandbox
    pub async fn retry_task(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE swarm_tasks
             SET status = 'pending', sandbox_id = NULL, error = NULL, result = NULL,
                 started_at = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1"
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Count tasks by status for a swarm
    pub async fn count_by_status(pool: &SqlitePool, swarm_id: Uuid) -> Result<TaskStatusCounts, sqlx::Error> {
        let row = sqlx::query(
            "SELECT
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
             FROM swarm_tasks
             WHERE swarm_id = $1"
        )
        .bind(swarm_id)
        .fetch_one(pool)
        .await?;

        Ok(TaskStatusCounts {
            pending: row.try_get::<i64, _>("pending")? as usize,
            running: row.try_get::<i64, _>("running")? as usize,
            completed: row.try_get::<i64, _>("completed")? as usize,
            failed: row.try_get::<i64, _>("failed")? as usize,
            cancelled: row.try_get::<i64, _>("cancelled")? as usize,
        })
    }
}

/// Task status counts for a swarm
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaskStatusCounts {
    pub pending: usize,
    pub running: usize,
    pub completed: usize,
    pub failed: usize,
    pub cancelled: usize,
}
