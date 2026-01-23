use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::user::User;

/// A single task approval record
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskApproval {
    pub id: Uuid,
    pub task_id: Uuid,
    pub user_id: Uuid,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Compact representation of a user for approval API responses
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskApprovalUser {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
}

impl From<User> for TaskApprovalUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
        }
    }
}

/// An approval with user details for API responses
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct TaskApprovalWithUser {
    #[serde(flatten)]
    pub approval: TaskApproval,
    pub user: TaskApprovalUser,
}

impl TaskApproval {
    /// Find all approvals for a task
    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, TaskApproval>(
            r#"SELECT id, task_id, user_id, created_at
               FROM task_approvals
               WHERE task_id = $1
               ORDER BY created_at ASC"#,
        )
        .bind(task_id)
        .fetch_all(pool)
        .await
    }

    /// Count approvals for a task
    pub async fn count_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64" FROM task_approvals WHERE task_id = $1"#,
            task_id
        )
        .fetch_one(pool)
        .await
    }

    /// Check if a user has already approved a task
    pub async fn exists(
        pool: &SqlitePool,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let count = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64" FROM task_approvals WHERE task_id = $1 AND user_id = $2"#,
            task_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count > 0)
    }

    /// Create an approval. Returns error if the user has already approved this task.
    pub async fn create(
        pool: &SqlitePool,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as::<_, TaskApproval>(
            r#"INSERT INTO task_approvals (id, task_id, user_id)
               VALUES ($1, $2, $3)
               RETURNING id, task_id, user_id, created_at"#,
        )
        .bind(id)
        .bind(task_id)
        .bind(user_id)
        .fetch_one(pool)
        .await
    }

    /// Remove an approval. Returns the number of rows affected.
    pub async fn delete(
        pool: &SqlitePool,
        task_id: Uuid,
        user_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_approvals WHERE task_id = $1 AND user_id = $2",
            task_id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Find all approvals for a task with user details
    pub async fn find_by_task_id_with_users(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<TaskApprovalWithUser>, sqlx::Error> {
        let approvals = Self::find_by_task_id(pool, task_id).await?;
        let mut result = Vec::with_capacity(approvals.len());

        for approval in approvals {
            let user = User::find_by_id(pool, approval.user_id).await?;
            if let Some(user) = user {
                result.push(TaskApprovalWithUser {
                    approval,
                    user: TaskApprovalUser::from(user),
                });
            }
        }

        Ok(result)
    }
}
