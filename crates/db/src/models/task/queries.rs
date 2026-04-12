//! CRUD query operations for tasks.

use chrono::{DateTime, Utc};
use sqlx::{Executor, Sqlite, SqlitePool};
use uuid::Uuid;

use super::{CreateTask, Task, TaskStatus, TaskWithAttemptStatus};
use crate::models::project::Project;

impl Task {
    pub async fn parent_project(&self, pool: &SqlitePool) -> Result<Option<Project>, sqlx::Error> {
        Project::find_by_id(pool, self.project_id).await
    }

    pub async fn find_by_project_id_with_attempt_status(
        pool: &SqlitePool,
        project_id: Uuid,
        include_archived: bool,
    ) -> Result<Vec<TaskWithAttemptStatus>, sqlx::Error> {
        let records = sqlx::query!(
            r#"SELECT
  t.id                            AS "id!: Uuid",
  t.project_id                    AS "project_id!: Uuid",
  t.title,
  t.description,
  t.status                        AS "status!: TaskStatus",
  t.parent_task_id                AS "parent_task_id: Uuid",
  t.shared_task_id                AS "shared_task_id: Uuid",
  t.created_at                    AS "created_at!: DateTime<Utc>",
  t.updated_at                    AS "updated_at!: DateTime<Utc>",
  t.remote_assignee_user_id       AS "remote_assignee_user_id: Uuid",
  t.remote_assignee_name,
  t.remote_assignee_username,
  t.remote_version                AS "remote_version!: i64",
  t.remote_last_synced_at         AS "remote_last_synced_at: DateTime<Utc>",
  t.remote_stream_node_id         AS "remote_stream_node_id: Uuid",
  t.remote_stream_url,
  t.archived_at                   AS "archived_at: DateTime<Utc>",
  t.activity_at                   AS "activity_at: DateTime<Utc>",

  CASE WHEN EXISTS (
    SELECT 1
      FROM task_attempts ta
      JOIN execution_processes ep
        ON ep.task_attempt_id = ta.id
     WHERE ta.task_id       = t.id
       AND ep.status        = 'running'
       AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
     LIMIT 1
  ) THEN 1 ELSE 0 END            AS "has_in_progress_attempt!: i64",

  CASE WHEN (
    SELECT ep.status
      FROM task_attempts ta
      JOIN execution_processes ep
        ON ep.task_attempt_id = ta.id
     WHERE ta.task_id       = t.id
     AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
     ORDER BY ep.created_at DESC
     LIMIT 1
  ) IN ('failed','killed') THEN 1 ELSE 0 END
                                 AS "last_attempt_failed!: i64",

  ( SELECT ta.executor
      FROM task_attempts ta
      WHERE ta.task_id = t.id
     ORDER BY ta.created_at DESC
      LIMIT 1
    )                               AS "executor!: String",

  (SELECT MAX(ep.started_at)
     FROM task_attempts ta
     JOIN execution_processes ep ON ep.task_attempt_id = ta.id
    WHERE ta.task_id = t.id
      AND ep.run_reason = 'codingagent'
      AND ep.dropped = FALSE
  )                                 AS "latest_execution_started_at: DateTime<Utc>",

  (SELECT MAX(ep.completed_at)
     FROM task_attempts ta
     JOIN execution_processes ep ON ep.task_attempt_id = ta.id
    WHERE ta.task_id = t.id
      AND ep.run_reason = 'codingagent'
      AND ep.dropped = FALSE
      AND ep.completed_at IS NOT NULL
  )                                 AS "latest_execution_completed_at: DateTime<Utc>",

  p.source_node_name

FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
WHERE t.project_id = $1
  AND (t.archived_at IS NULL OR $2)
ORDER BY COALESCE(t.activity_at, t.created_at) DESC"#,
            project_id,
            include_archived
        )
        .fetch_all(pool)
        .await?;

        let tasks = records
            .into_iter()
            .map(|rec| TaskWithAttemptStatus {
                task: Task {
                    id: rec.id,
                    project_id: rec.project_id,
                    title: rec.title,
                    description: rec.description,
                    status: rec.status,
                    parent_task_id: rec.parent_task_id,
                    shared_task_id: rec.shared_task_id,
                    created_at: rec.created_at,
                    updated_at: rec.updated_at,
                    remote_assignee_user_id: rec.remote_assignee_user_id,
                    remote_assignee_name: rec.remote_assignee_name,
                    remote_assignee_username: rec.remote_assignee_username,
                    remote_version: rec.remote_version,
                    remote_last_synced_at: rec.remote_last_synced_at,
                    remote_stream_node_id: rec.remote_stream_node_id,
                    remote_stream_url: rec.remote_stream_url,
                    archived_at: rec.archived_at,
                    activity_at: rec.activity_at,
                },
                has_in_progress_attempt: rec.has_in_progress_attempt != 0,
                has_merged_attempt: false, // TODO use merges table
                last_attempt_failed: rec.last_attempt_failed != 0,
                executor: rec.executor,
                latest_execution_started_at: rec.latest_execution_started_at,
                latest_execution_completed_at: rec.latest_execution_completed_at,
                source_node_name: rec.source_node_name,
            })
            .collect();

        Ok(tasks)
    }

    /// Fetch a single task with its attempt status.
    ///
    /// Equivalent to `find_by_project_id_with_attempt_status` filtered to one task.
    /// Uses two cached queries rather than one new macro to preserve the .sqlx cache.
    pub async fn find_by_id_with_attempt_status(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<Option<TaskWithAttemptStatus>, sqlx::Error> {
        // Step 1: resolve project_id (needed for the attempt-status query)
        let task = Self::find_by_id(pool, id).await?;
        let Some(task) = task else {
            return Ok(None);
        };
        // Step 2: fetch all tasks for the project with status, then pick ours
        let tasks =
            Self::find_by_project_id_with_attempt_status(pool, task.project_id, true).await?;
        Ok(tasks.into_iter().find(|t| t.task.id == id))
    }

    // NOTE: A single-query version of find_by_id_with_attempt_status exists as a draft
    // but requires running `cargo sqlx prepare` to cache it. Add it here once the
    // .sqlx cache is regenerated (run: DATABASE_URL=sqlite:dev_assets/db.sqlite cargo sqlx prepare)
    #[allow(dead_code)]
    fn _single_query_reminder() {}

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_task_id as "parent_task_id: Uuid", shared_task_id as "shared_task_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>",
                      remote_assignee_user_id as "remote_assignee_user_id: Uuid",
                      remote_assignee_name,
                      remote_assignee_username,
                      remote_version as "remote_version!: i64",
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      remote_stream_node_id as "remote_stream_node_id: Uuid",
                      remote_stream_url,
                      archived_at as "archived_at: DateTime<Utc>",
                      activity_at as "activity_at: DateTime<Utc>"
               FROM tasks
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_task_id as "parent_task_id: Uuid", shared_task_id as "shared_task_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>",
                      remote_assignee_user_id as "remote_assignee_user_id: Uuid",
                      remote_assignee_name,
                      remote_assignee_username,
                      remote_version as "remote_version!: i64",
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      remote_stream_node_id as "remote_stream_node_id: Uuid",
                      remote_stream_url,
                      archived_at as "archived_at: DateTime<Utc>",
                      activity_at as "activity_at: DateTime<Utc>"
               FROM tasks
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id_and_project_id(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_task_id as "parent_task_id: Uuid", shared_task_id as "shared_task_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>",
                      remote_assignee_user_id as "remote_assignee_user_id: Uuid",
                      remote_assignee_name,
                      remote_assignee_username,
                      remote_version as "remote_version!: i64",
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      remote_stream_node_id as "remote_stream_node_id: Uuid",
                      remote_stream_url,
                      archived_at as "archived_at: DateTime<Utc>",
                      activity_at as "activity_at: DateTime<Utc>"
               FROM tasks
               WHERE id = $1 AND project_id = $2"#,
            id,
            project_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_shared_task_id<'e, E>(
        executor: E,
        shared_task_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_task_id as "parent_task_id: Uuid", shared_task_id as "shared_task_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>",
                      remote_assignee_user_id as "remote_assignee_user_id: Uuid",
                      remote_assignee_name,
                      remote_assignee_username,
                      remote_version as "remote_version!: i64",
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      remote_stream_node_id as "remote_stream_node_id: Uuid",
                      remote_stream_url,
                      archived_at as "archived_at: DateTime<Utc>",
                      activity_at as "activity_at: DateTime<Utc>"
               FROM tasks
               WHERE shared_task_id = $1
               LIMIT 1"#,
            shared_task_id
        )
        .fetch_optional(executor)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTask,
        task_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let status = data.status.clone().unwrap_or_default();
        sqlx::query_as!(
            Task,
            r#"INSERT INTO tasks (id, project_id, title, description, status, parent_task_id, shared_task_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_task_id as "parent_task_id: Uuid", shared_task_id as "shared_task_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>",
                         remote_assignee_user_id as "remote_assignee_user_id: Uuid",
                         remote_assignee_name,
                         remote_assignee_username,
                         remote_version as "remote_version!: i64",
                         remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                         remote_stream_node_id as "remote_stream_node_id: Uuid",
                         remote_stream_url,
                         archived_at as "archived_at: DateTime<Utc>",
                         activity_at as "activity_at: DateTime<Utc>""#,
            task_id,
            data.project_id,
            data.title,
            data.description,
            status,
            data.parent_task_id,
            data.shared_task_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
        title: String,
        description: Option<String>,
        status: TaskStatus,
        parent_task_id: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"UPDATE tasks
               SET title = $3, description = $4, status = $5, parent_task_id = $6
               WHERE id = $1 AND project_id = $2
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_task_id as "parent_task_id: Uuid", shared_task_id as "shared_task_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>",
                         remote_assignee_user_id as "remote_assignee_user_id: Uuid",
                         remote_assignee_name,
                         remote_assignee_username,
                         remote_version as "remote_version!: i64",
                         remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                         remote_stream_node_id as "remote_stream_node_id: Uuid",
                         remote_stream_url,
                         archived_at as "archived_at: DateTime<Utc>",
                         activity_at as "activity_at: DateTime<Utc>""#,
            id,
            project_id,
            title,
            description,
            status,
            parent_task_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM tasks WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn exists(
        pool: &SqlitePool,
        id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "SELECT id as \"id!: Uuid\" FROM tasks WHERE id = $1 AND project_id = $2",
            id,
            project_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(result.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        project::{CreateProject, Project},
        task::tests::setup_test_pool,
    };

    #[tokio::test]
    async fn test_task_crud() {
        let (pool, _temp_dir) = setup_test_pool().await;

        // Create project
        let project_id = Uuid::new_v4();
        let project_data = CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: format!("/tmp/test-repo-{}", project_id),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let _project = Project::create(&pool, &project_data, project_id)
            .await
            .expect("Failed to create project");

        // Create task
        let task_id = Uuid::new_v4();
        let task_data = CreateTask::from_title_description(
            project_id,
            "Test Task".to_string(),
            Some("Description".to_string()),
        );
        let task = Task::create(&pool, &task_data, task_id)
            .await
            .expect("Failed to create task");

        assert_eq!(task.id, task_id);
        assert_eq!(task.title, "Test Task");
        assert_eq!(task.description, Some("Description".to_string()));
        assert_eq!(task.status, TaskStatus::Todo);

        // Find by ID
        let found = Task::find_by_id(&pool, task_id)
            .await
            .expect("Query failed")
            .expect("Task not found");
        assert_eq!(found.id, task_id);

        // Find by ID and project_id
        let found = Task::find_by_id_and_project_id(&pool, task_id, project_id)
            .await
            .expect("Query failed")
            .expect("Task not found");
        assert_eq!(found.id, task_id);

        // Exists check
        let exists = Task::exists(&pool, task_id, project_id)
            .await
            .expect("Query failed");
        assert!(exists);

        // Update
        let updated = Task::update(
            &pool,
            task_id,
            project_id,
            "Updated Title".to_string(),
            Some("Updated Desc".to_string()),
            TaskStatus::InProgress,
            None,
        )
        .await
        .expect("Update failed");
        assert_eq!(updated.title, "Updated Title");
        assert_eq!(updated.status, TaskStatus::InProgress);

        // Delete
        let deleted = Task::delete(&pool, task_id).await.expect("Delete failed");
        assert_eq!(deleted, 1);

        // Verify deleted
        let found = Task::find_by_id(&pool, task_id)
            .await
            .expect("Query failed");
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn test_find_by_project_id_with_attempt_status() {
        let (pool, _temp_dir) = setup_test_pool().await;

        // Create project
        let project_id = Uuid::new_v4();
        let project_data = CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: format!("/tmp/test-repo-{}", project_id),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        let _project = Project::create(&pool, &project_data, project_id)
            .await
            .expect("Failed to create project");

        // Create tasks
        for i in 0..3 {
            let task_id = Uuid::new_v4();
            let task_data =
                CreateTask::from_title_description(project_id, format!("Task {}", i), None);
            Task::create(&pool, &task_data, task_id)
                .await
                .expect("Failed to create task");
        }

        // Query with attempt status
        let tasks = Task::find_by_project_id_with_attempt_status(&pool, project_id, false)
            .await
            .expect("Query failed");

        assert_eq!(tasks.len(), 3);
        for task in &tasks {
            assert_eq!(task.project_id, project_id);
            assert!(!task.has_in_progress_attempt);
            assert!(!task.has_merged_attempt);
            assert!(!task.last_attempt_failed);
        }
    }
}
