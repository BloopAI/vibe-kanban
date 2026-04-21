//! Per-parent child-workspace concurrency gate.
//!
//! Used by `/api/tasks/start` to decide whether a parent workspace has room
//! for another running child. A "running child" is a workspace `w` where
//! `w.task_id -> tasks.parent_workspace_id = P` AND `w` has a session whose
//! latest `execution_process` has `status = 'running'`.

use sqlx::SqlitePool;
use uuid::Uuid;

pub struct TaskConcurrency;

impl TaskConcurrency {
    /// Reads `VK_MAX_CHILDREN_PER_PARENT`; default 5. Invalid values fall
    /// back to the default.
    pub fn limit() -> u32 {
        std::env::var("VK_MAX_CHILDREN_PER_PARENT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5)
    }

    /// Counts workspaces descended from `parent` whose latest
    /// execution_process (per session) is `running`.
    ///
    /// Join path: `workspaces w -> tasks t ON t.id = w.task_id ->
    /// sessions s ON s.workspace_id = w.id -> execution_processes ep ON
    /// ep.session_id = s.id`. Uses `COUNT(DISTINCT w.id)` so that a workspace
    /// with multiple sessions is only counted once.
    pub async fn running_children(pool: &SqlitePool, parent: Uuid) -> Result<u32, sqlx::Error> {
        let count: i64 = sqlx::query_scalar::<_, i64>(
            r#"SELECT COUNT(DISTINCT w.id)
               FROM workspaces w
               JOIN tasks t    ON t.id = w.task_id
               JOIN sessions s ON s.workspace_id = w.id
               JOIN execution_processes ep ON ep.session_id = s.id
               WHERE t.parent_workspace_id = ?
                 AND ep.status = 'running'
                 AND ep.created_at = (
                     SELECT MAX(created_at)
                     FROM execution_processes
                     WHERE session_id = s.id
                 )"#,
        )
        .bind(parent)
        .fetch_one(pool)
        .await?;
        Ok(count.max(0) as u32)
    }

    /// True iff `running_children(pool, parent) < limit()`.
    pub async fn check_room(pool: &SqlitePool, parent: Uuid) -> Result<bool, sqlx::Error> {
        let running = Self::running_children(pool, parent).await?;
        Ok(running < Self::limit())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use db::DBService;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use super::*;

    /// Env-var tests mutate process-global state, so serialize them behind a
    /// mutex to stay hermetic when `cargo test` runs threads in parallel.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[tokio::test]
    async fn limit_default_is_five() {
        let _guard = ENV_LOCK.lock().unwrap();
        // SAFETY: the ENV_LOCK mutex serializes env-var access across tests
        // in this module, so no other thread observes the mutation.
        unsafe {
            std::env::remove_var("VK_MAX_CHILDREN_PER_PARENT");
        }
        assert_eq!(TaskConcurrency::limit(), 5);
    }

    #[tokio::test]
    async fn limit_reads_env_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        // SAFETY: the ENV_LOCK mutex serializes env-var access across tests
        // in this module, so no other thread observes the mutation.
        unsafe {
            std::env::set_var("VK_MAX_CHILDREN_PER_PARENT", "12");
        }
        assert_eq!(TaskConcurrency::limit(), 12);
        // SAFETY: same reasoning as above; cleanup keeps the test hermetic.
        unsafe {
            std::env::remove_var("VK_MAX_CHILDREN_PER_PARENT");
        }
    }

    async fn seed_project(pool: &SqlitePool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO projects (id, name, created_at, updated_at) \
             VALUES (?1, 'p', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    async fn seed_bare_workspace(pool: &SqlitePool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO workspaces \
                 (id, branch, created_at, updated_at, archived, pinned, worktree_deleted) \
             VALUES (?, 'main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0)",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    async fn seed_task(pool: &SqlitePool, project_id: Uuid, parent: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO tasks \
                 (id, project_id, title, description, parent_workspace_id, \
                  created_at, updated_at) \
             VALUES (?, ?, 't', NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(id)
        .bind(project_id)
        .bind(parent)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    async fn seed_child_workspace(pool: &SqlitePool, task_id: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO workspaces \
                 (id, task_id, branch, created_at, updated_at, archived, pinned, \
                  worktree_deleted) \
             VALUES (?, ?, 'main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0)",
        )
        .bind(id)
        .bind(task_id)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    async fn seed_session(pool: &SqlitePool, workspace_id: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO sessions (id, workspace_id, created_at, updated_at) \
             VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(id)
        .bind(workspace_id)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    async fn seed_ep(pool: &SqlitePool, session_id: Uuid, status: &str) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO execution_processes \
                 (id, session_id, run_reason, executor_action, status, \
                  started_at, created_at, updated_at) \
             VALUES (?, ?, 'codingagent', '{}', ?, \
                     datetime('now','subsec'), datetime('now','subsec'), \
                     datetime('now','subsec'))",
        )
        .bind(id)
        .bind(session_id)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    #[tokio::test]
    async fn running_children_count_is_accurate() -> sqlx::Result<()> {
        let db = DBService::new_in_memory().await.expect("in-memory db");
        let pool = &db.pool;

        let project_id = seed_project(pool).await;
        let parent = seed_bare_workspace(pool).await;

        // Two running children.
        for _ in 0..2 {
            let task_id = seed_task(pool, project_id, parent).await;
            let ws_id = seed_child_workspace(pool, task_id).await;
            let sess_id = seed_session(pool, ws_id).await;
            seed_ep(pool, sess_id, "running").await;
        }

        // One child whose latest EP is completed (must NOT count).
        {
            let task_id = seed_task(pool, project_id, parent).await;
            let ws_id = seed_child_workspace(pool, task_id).await;
            let sess_id = seed_session(pool, ws_id).await;
            seed_ep(pool, sess_id, "completed").await;
        }

        // Unrelated running child under a different parent (must NOT count).
        {
            let other_parent = seed_bare_workspace(pool).await;
            let task_id = seed_task(pool, project_id, other_parent).await;
            let ws_id = seed_child_workspace(pool, task_id).await;
            let sess_id = seed_session(pool, ws_id).await;
            seed_ep(pool, sess_id, "running").await;
        }

        let n = TaskConcurrency::running_children(pool, parent).await?;
        assert_eq!(n, 2);
        Ok(())
    }
}
