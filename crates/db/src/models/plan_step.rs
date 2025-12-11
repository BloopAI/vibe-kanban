use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(
    Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default,
)]
#[sqlx(type_name = "plan_step_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum PlanStepStatus {
    #[default]
    Pending,
    Ready,
    InProgress,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct PlanStep {
    pub id: Uuid,
    pub parent_attempt_id: Uuid, // Foreign key to TaskAttempt
    pub sequence_order: i32,
    pub title: String,
    pub description: Option<String>,
    pub status: PlanStepStatus,
    pub child_task_id: Option<Uuid>, // Foreign key to Task
    pub auto_start: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct CreatePlanStep {
    pub parent_attempt_id: Uuid,
    pub sequence_order: i32,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<PlanStepStatus>,
    pub child_task_id: Option<Uuid>,
    pub auto_start: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct UpdatePlanStep {
    pub sequence_order: Option<i32>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<PlanStepStatus>,
    pub child_task_id: Option<Uuid>,
    pub auto_start: Option<bool>,
}

impl PlanStep {
    pub async fn create(pool: &SqlitePool, data: &CreatePlanStep) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let status = data.status.clone().unwrap_or_default();
        let auto_start = data.auto_start.unwrap_or(true);

        sqlx::query_as!(
            PlanStep,
            r#"INSERT INTO plan_steps (id, parent_attempt_id, sequence_order, title, description, status, child_task_id, auto_start)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id as "id!: Uuid",
                         parent_attempt_id as "parent_attempt_id!: Uuid",
                         sequence_order as "sequence_order!: i32",
                         title,
                         description,
                         status as "status!: PlanStepStatus",
                         child_task_id as "child_task_id: Uuid",
                         auto_start as "auto_start!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.parent_attempt_id,
            data.sequence_order,
            data.title,
            data.description,
            status,
            data.child_task_id,
            auto_start
        )
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            PlanStep,
            r#"SELECT id as "id!: Uuid",
                      parent_attempt_id as "parent_attempt_id!: Uuid",
                      sequence_order as "sequence_order!: i32",
                      title,
                      description,
                      status as "status!: PlanStepStatus",
                      child_task_id as "child_task_id: Uuid",
                      auto_start as "auto_start!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM plan_steps
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_attempt_id(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            PlanStep,
            r#"SELECT id as "id!: Uuid",
                      parent_attempt_id as "parent_attempt_id!: Uuid",
                      sequence_order as "sequence_order!: i32",
                      title,
                      description,
                      status as "status!: PlanStepStatus",
                      child_task_id as "child_task_id: Uuid",
                      auto_start as "auto_start!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM plan_steps
               WHERE parent_attempt_id = $1
               ORDER BY sequence_order ASC"#,
            attempt_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdatePlanStep,
    ) -> Result<Option<Self>, sqlx::Error> {
        // Fetch current values
        let current = match Self::find_by_id(pool, id).await? {
            Some(step) => step,
            None => return Ok(None),
        };

        let sequence_order = data.sequence_order.unwrap_or(current.sequence_order);
        let title = data.title.clone().unwrap_or(current.title);
        let description = data.description.clone().or(current.description);
        let status = data.status.clone().unwrap_or(current.status);
        let child_task_id = data.child_task_id.or(current.child_task_id);
        let auto_start = data.auto_start.unwrap_or(current.auto_start);

        sqlx::query_as!(
            PlanStep,
            r#"UPDATE plan_steps
               SET sequence_order = $2,
                   title = $3,
                   description = $4,
                   status = $5,
                   child_task_id = $6,
                   auto_start = $7,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         parent_attempt_id as "parent_attempt_id!: Uuid",
                         sequence_order as "sequence_order!: i32",
                         title,
                         description,
                         status as "status!: PlanStepStatus",
                         child_task_id as "child_task_id: Uuid",
                         auto_start as "auto_start!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            sequence_order,
            title,
            description,
            status,
            child_task_id,
            auto_start
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: PlanStepStatus,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE plan_steps SET status = $2, updated_at = datetime('now', 'subsec') WHERE id = $1",
            id,
            status
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn set_child_task_id(
        pool: &SqlitePool,
        id: Uuid,
        child_task_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE plan_steps SET child_task_id = $2, updated_at = datetime('now', 'subsec') WHERE id = $1",
            id,
            child_task_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM plan_steps WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_attempt_id(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM plan_steps WHERE parent_attempt_id = $1",
            attempt_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Reorder plan steps for an attempt by updating sequence_order values
    /// Takes a list of step IDs in the desired order
    pub async fn reorder(
        pool: &SqlitePool,
        attempt_id: Uuid,
        step_ids: &[Uuid],
    ) -> Result<(), sqlx::Error> {
        // Use a transaction to ensure atomicity
        let mut tx = pool.begin().await?;

        for (index, step_id) in step_ids.iter().enumerate() {
            let sequence_order = index as i32;
            sqlx::query!(
                r#"UPDATE plan_steps
                   SET sequence_order = $1, updated_at = datetime('now', 'subsec')
                   WHERE id = $2 AND parent_attempt_id = $3"#,
                sequence_order,
                step_id,
                attempt_id
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
}
