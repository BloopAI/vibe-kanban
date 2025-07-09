use std::path::Path;

use chrono::{DateTime, Utc};
use git2::{BranchType, Error as GitError, Repository};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use tracing::{debug, info};
use ts_rs::TS;
use uuid::Uuid;

use super::{project::Project, task::Task};
use crate::{
    executor::Executor,
    services::{GitService, GitServiceError, GitHubService, GitHubServiceError, CreatePrRequest},
    utils::shell::get_shell_command,
};

#[derive(Debug)]
pub enum TaskAttemptError {
    Database(sqlx::Error),
    Git(GitError),
    GitService(GitServiceError),
    GitHubService(GitHubServiceError),
    TaskNotFound,
    ProjectNotFound,
    ValidationError(String),
    BranchNotFound(String),
}

impl std::fmt::Display for TaskAttemptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskAttemptError::Database(e) => write!(f, "Database error: {}", e),
            TaskAttemptError::Git(e) => write!(f, "Git error: {}", e),
            TaskAttemptError::GitService(e) => write!(f, "Git service error: {}", e),
            TaskAttemptError::GitHubService(e) => write!(f, "GitHub service error: {}", e),
            TaskAttemptError::TaskNotFound => write!(f, "Task not found"),
            TaskAttemptError::ProjectNotFound => write!(f, "Project not found"),
            TaskAttemptError::ValidationError(e) => write!(f, "Validation error: {}", e),
            TaskAttemptError::BranchNotFound(e) => write!(f, "Branch not found: {}", e),
        }
    }
}

impl std::error::Error for TaskAttemptError {}

impl From<sqlx::Error> for TaskAttemptError {
    fn from(err: sqlx::Error) -> Self {
        TaskAttemptError::Database(err)
    }
}

impl From<GitError> for TaskAttemptError {
    fn from(err: GitError) -> Self {
        TaskAttemptError::Git(err)
    }
}

impl From<GitServiceError> for TaskAttemptError {
    fn from(err: GitServiceError) -> Self {
        TaskAttemptError::GitService(err)
    }
}

impl From<GitHubServiceError> for TaskAttemptError {
    fn from(err: GitHubServiceError) -> Self {
        TaskAttemptError::GitHubService(err)
    }
}

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS)]
#[sqlx(type_name = "task_attempt_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum TaskAttemptStatus {
    SetupRunning,
    SetupComplete,
    SetupFailed,
    ExecutorRunning,
    ExecutorComplete,
    ExecutorFailed,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskAttempt {
    pub id: Uuid,
    pub task_id: Uuid, // Foreign key to Task
    pub worktree_path: String,
    pub branch: String,      // Git branch name for this task attempt
    pub base_branch: String, // Base branch this attempt is based on
    pub merge_commit: Option<String>,
    pub executor: Option<String>,  // Name of the executor to use
    pub pr_url: Option<String>,    // GitHub PR URL
    pub pr_number: Option<i64>,    // GitHub PR number
    pub pr_status: Option<String>, // open, closed, merged
    pub pr_merged_at: Option<DateTime<Utc>>, // When PR was merged
    pub worktree_deleted: bool,    // Flag indicating if worktree has been cleaned up
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTaskAttempt {
    pub executor: Option<String>, // Optional executor name (defaults to "echo")
    pub base_branch: Option<String>, // Optional base branch to checkout (defaults to current HEAD)
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTaskAttempt {
    // Currently no updateable fields, but keeping struct for API compatibility
}

/// GitHub PR creation parameters
pub struct CreatePrParams<'a> {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub github_token: &'a str,
    pub title: &'a str,
    pub body: Option<&'a str>,
    pub base_branch: Option<&'a str>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum DiffChunkType {
    Equal,
    Insert,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiffChunk {
    pub chunk_type: DiffChunkType,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FileDiff {
    pub path: String,
    pub chunks: Vec<DiffChunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WorktreeDiff {
    pub files: Vec<FileDiff>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BranchStatus {
    pub is_behind: bool,
    pub commits_behind: usize,
    pub commits_ahead: usize,
    pub up_to_date: bool,
    pub merged: bool,
    pub has_uncommitted_changes: bool,
    pub base_branch_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ExecutionState {
    NotStarted,
    SetupRunning,
    SetupComplete,
    SetupFailed,
    CodingAgentRunning,
    CodingAgentComplete,
    CodingAgentFailed,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskAttemptState {
    pub execution_state: ExecutionState,
    pub has_changes: bool,
    pub has_setup_script: bool,
    pub setup_process_id: Option<String>,
    pub coding_agent_process_id: Option<String>,
}

impl TaskAttempt {
    /// Helper function to mark a worktree as deleted in the database
    pub async fn mark_worktree_deleted(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET worktree_deleted = TRUE, updated_at = datetime('now') WHERE id = ?",
            attempt_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get the base directory for vibe-kanban worktrees
    pub fn get_worktree_base_dir() -> std::path::PathBuf {
        if cfg!(target_os = "macos") {
            // macOS already uses /var/folders/... which is persistent storage
            std::env::temp_dir().join("vibe-kanban")
        } else if cfg!(target_os = "linux") {
            // Linux: use /var/tmp instead of /tmp to avoid RAM usage
            std::path::PathBuf::from("/var/tmp/vibe-kanban")
        } else {
            // Windows and other platforms: use temp dir with vibe-kanban subdirectory
            std::env::temp_dir().join("vibe-kanban")
        }
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       worktree_path,
                       branch,
                       merge_commit,
                       base_branch,
                       executor,
                       pr_url,
                       pr_number,
                       pr_status,
                       pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       worktree_deleted  AS "worktree_deleted!: bool",
                       created_at        AS "created_at!: DateTime<Utc>",
                       updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts
               WHERE   id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  id                AS "id!: Uuid",
                       task_id           AS "task_id!: Uuid",
                       worktree_path,
                       branch,
                       base_branch,
                       merge_commit,
                       executor,
                       pr_url,
                       pr_number,
                       pr_status,
                       pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       worktree_deleted  AS "worktree_deleted!: bool",
                       created_at        AS "created_at!: DateTime<Utc>",
                       updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts
               WHERE   task_id = $1
               ORDER BY created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find task attempts by task_id with project git repo path for cleanup operations
    pub async fn find_by_task_id_with_project(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<(Uuid, String, String)>, sqlx::Error> {
        let records = sqlx::query!(
            r#"
            SELECT ta.id as "attempt_id!: Uuid", ta.worktree_path, p.git_repo_path as "git_repo_path!"
            FROM task_attempts ta
            JOIN tasks t ON ta.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            WHERE ta.task_id = $1
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records
            .into_iter()
            .map(|r| (r.attempt_id, r.worktree_path, r.git_repo_path))
            .collect())
    }

    /// Find task attempts that are expired (4+ minutes since last activity) and eligible for worktree cleanup
    pub async fn find_expired_for_cleanup(
        pool: &SqlitePool,
    ) -> Result<Vec<(Uuid, String, String)>, sqlx::Error> {
        let records = sqlx::query!(
            r#"
            SELECT ta.id as "attempt_id!: Uuid", ta.worktree_path, p.git_repo_path as "git_repo_path!"
            FROM task_attempts ta
            JOIN execution_processes ep ON ta.id = ep.task_attempt_id
            JOIN tasks t ON ta.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            WHERE ep.completed_at IS NOT NULL
                AND ta.worktree_deleted = FALSE
            GROUP BY ta.id, ta.worktree_path, p.git_repo_path
            HAVING datetime('now', '-24 hours') > datetime(MAX(ep.completed_at))
                AND ta.id NOT IN (
                    SELECT DISTINCT ep2.task_attempt_id
                    FROM execution_processes ep2
                    WHERE ep2.completed_at IS NULL
                )
            ORDER BY MAX(ep.completed_at) ASC
            "#
        )
        .fetch_all(pool)
        .await?;

        Ok(records
            .into_iter()
            .filter_map(|r| {
                r.worktree_path
                    .map(|path| (r.attempt_id, path, r.git_repo_path))
            })
            .collect())
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskAttempt,
        task_id: Uuid,
    ) -> Result<Self, TaskAttemptError> {
        let attempt_id = Uuid::new_v4();
        // let prefixed_id = format!("vibe-kanban-{}", attempt_id);

        // First, get the task to get the project_id
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        // Create a unique and helpful branch name
        let task_title_id = crate::utils::text::git_branch_id(&task.title);
        let task_attempt_branch = format!(
            "vk-{}-{}",
            crate::utils::text::short_uuid(&attempt_id),
            task_title_id
        );

        // Generate worktree path using vibe-kanban specific directory
        let worktree_path = Self::get_worktree_base_dir().join(&task_attempt_branch);
        let worktree_path_str = worktree_path.to_string_lossy().to_string();

        // Then get the project using the project_id
        let project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Create GitService instance
        let git_service = GitService::new(&project.git_repo_path)?;

        // Determine the resolved base branch name first
        let resolved_base_branch = if let Some(ref base_branch) = data.base_branch {
            base_branch.clone()
        } else {
            // Default to current HEAD branch name or "main"
            git_service.get_default_branch_name()?
        };

        // Create the worktree using GitService
        git_service.create_worktree(
            &task_attempt_branch,
            &worktree_path,
            data.base_branch.as_deref(),
        )?;

        // Insert the record into the database
        Ok(sqlx::query_as!(
            TaskAttempt,
            r#"INSERT INTO task_attempts (id, task_id, worktree_path, branch, base_branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at, worktree_deleted)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, branch, base_branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at as "pr_merged_at: DateTime<Utc>", worktree_deleted as "worktree_deleted!: bool", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            attempt_id,
            task_id,
            worktree_path_str,
            task_attempt_branch,
            resolved_base_branch,
            Option::<String>::None, // merge_commit is always None during creation
            data.executor,
            Option::<String>::None, // pr_url is None during creation
            Option::<i64>::None, // pr_number is None during creation
            Option::<String>::None, // pr_status is None during creation
            Option::<DateTime<Utc>>::None, // pr_merged_at is None during creation
            false // worktree_deleted is false during creation
        )
        .fetch_one(pool)
        .await?)
    }

    pub async fn exists_for_task(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "SELECT ta.id as \"id!: Uuid\" FROM task_attempts ta 
             JOIN tasks t ON ta.task_id = t.id 
             WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3",
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?;
        Ok(result.is_some())
    }

    /// Perform the actual merge operation using GitService
    fn perform_merge_operation(
        worktree_path: &str,
        main_repo_path: &str,
        branch_name: &str,
        task_title: &str,
    ) -> Result<String, TaskAttemptError> {
        let git_service = GitService::new(main_repo_path)?;
        let worktree_path = Path::new(worktree_path);
        
        git_service.merge_changes(worktree_path, branch_name, task_title)
            .map_err(TaskAttemptError::from)
    }

    /// Perform the actual git rebase operations using GitService
    fn perform_rebase_operation(
        worktree_path: &str,
        main_repo_path: &str,
        new_base_branch: Option<String>,
    ) -> Result<String, TaskAttemptError> {
        let git_service = GitService::new(main_repo_path)?;
        let worktree_path = Path::new(worktree_path);
        
        git_service.rebase_branch(worktree_path, new_base_branch.as_deref())
            .map_err(TaskAttemptError::from)
    }

    /// Merge the worktree changes back to the main repository
    pub async fn merge_changes(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.worktree_path,
                       ta.branch,
                       ta.base_branch,
                       ta.merge_commit,
                       ta.executor,
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               WHERE   ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Get the task and project
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "merge").await?;

        // Perform the actual merge operation
        let merge_commit_id = Self::perform_merge_operation(
            &worktree_path,
            &project.git_repo_path,
            &attempt.branch,
            &task.title,
        )?;

        // Update the task attempt with the merge commit
        sqlx::query!(
            "UPDATE task_attempts SET merge_commit = $1, updated_at = datetime('now') WHERE id = $2",
            merge_commit_id,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(merge_commit_id)
    }

    /// Start the execution flow for a task attempt (setup script + executor)
    pub async fn start_execution(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<(), TaskAttemptError> {
        use crate::models::task::{Task, TaskStatus};

        // Load required entities
        let (task_attempt, project) =
            Self::load_execution_context(pool, attempt_id, project_id).await?;

        // Update task status to indicate execution has started
        Task::update_status(pool, task_id, project_id, TaskStatus::InProgress).await?;

        // Determine execution sequence based on project configuration
        if Self::should_run_setup_script(&project) {
            Self::start_setup_script(
                pool,
                app_state,
                attempt_id,
                task_id,
                &project,
                &task_attempt.worktree_path,
            )
            .await
        } else {
            Self::start_coding_agent(pool, app_state, attempt_id, task_id, project_id).await
        }
    }

    /// Load the execution context (task attempt and project) with validation
    async fn load_execution_context(
        pool: &SqlitePool,
        attempt_id: Uuid,
        project_id: Uuid,
    ) -> Result<(TaskAttempt, Project), TaskAttemptError> {
        let task_attempt = TaskAttempt::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        Ok((task_attempt, project))
    }

    /// Check if setup script should be executed
    fn should_run_setup_script(project: &Project) -> bool {
        project
            .setup_script
            .as_ref()
            .map(|script| !script.trim().is_empty())
            .unwrap_or(false)
    }

    /// Start the setup script execution
    async fn start_setup_script(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        project: &Project,
        worktree_path: &str,
    ) -> Result<(), TaskAttemptError> {
        let setup_script = project.setup_script.as_ref().unwrap();

        Self::start_process_execution(
            pool,
            app_state,
            attempt_id,
            task_id,
            crate::executor::ExecutorType::SetupScript(setup_script.clone()),
            "Starting setup script".to_string(),
            TaskAttemptStatus::SetupRunning,
            crate::models::execution_process::ExecutionProcessType::SetupScript,
            worktree_path,
        )
        .await
    }

    /// Start the coding agent after setup is complete or if no setup is needed
    pub async fn start_coding_agent(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        _project_id: Uuid,
    ) -> Result<(), TaskAttemptError> {
        let task_attempt = TaskAttempt::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let executor_config = Self::resolve_executor_config(&task_attempt.executor);

        Self::start_process_execution(
            pool,
            app_state,
            attempt_id,
            task_id,
            crate::executor::ExecutorType::CodingAgent(executor_config),
            "Starting executor".to_string(),
            TaskAttemptStatus::ExecutorRunning,
            crate::models::execution_process::ExecutionProcessType::CodingAgent,
            &task_attempt.worktree_path,
        )
        .await
    }

    /// Start a dev server for this task attempt
    pub async fn start_dev_server(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<(), TaskAttemptError> {
        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "dev server").await?;

        // Get the project to access the dev_script
        let project = crate::models::project::Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let dev_script = project.dev_script.ok_or_else(|| {
            TaskAttemptError::ValidationError(
                "No dev script configured for this project".to_string(),
            )
        })?;

        if dev_script.trim().is_empty() {
            return Err(TaskAttemptError::ValidationError(
                "Dev script is empty".to_string(),
            ));
        }

        let result = Self::start_process_execution(
            pool,
            app_state,
            attempt_id,
            task_id,
            crate::executor::ExecutorType::DevServer(dev_script),
            "Starting dev server".to_string(),
            TaskAttemptStatus::ExecutorRunning, // Dev servers don't create activities, just use generic status
            crate::models::execution_process::ExecutionProcessType::DevServer,
            &worktree_path,
        )
        .await;

        if result.is_ok() {
            app_state
                .track_analytics_event(
                    "dev_server_started",
                    Some(serde_json::json!({
                        "task_id": task_id.to_string(),
                        "project_id": project_id.to_string(),
                        "attempt_id": attempt_id.to_string()
                    })),
                )
                .await;
        }

        result
    }

    /// Start a follow-up execution using the same executor type as the first process
    /// Returns the attempt_id that was actually used (always the original attempt_id for session continuity)
    pub async fn start_followup_execution(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
        prompt: &str,
    ) -> Result<Uuid, TaskAttemptError> {
        use crate::models::{
            executor_session::ExecutorSession,
            task::{Task, TaskStatus},
        };

        // Get the current task attempt to check if worktree is deleted
        let current_attempt = TaskAttempt::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let actual_attempt_id = attempt_id;

        if current_attempt.worktree_deleted {
            info!(
                "Resurrecting deleted attempt {} (branch: {}) for followup execution - maintaining session continuity",
                attempt_id, current_attempt.branch
            );
        } else {
            info!(
                "Continuing followup execution on active attempt {} (branch: {})",
                attempt_id, current_attempt.branch
            );
        }

        // Update task status to indicate follow-up execution has started
        Task::update_status(pool, task_id, project_id, TaskStatus::InProgress).await?;

        // Ensure worktree exists (recreate if needed for cold task support)
        // This will resurrect the worktree at the exact same path for session continuity
        let worktree_path =
            Self::ensure_worktree_exists(pool, actual_attempt_id, project_id, "followup").await?;

        // Find the most recent coding agent execution process to get the executor type
        // Look up processes from the ORIGINAL attempt to find the session
        let execution_processes =
            crate::models::execution_process::ExecutionProcess::find_by_task_attempt_id(
                pool, attempt_id,
            )
            .await?;
        let most_recent_coding_agent = execution_processes
            .iter()
            .rev() // Reverse to get most recent first (since they're ordered by created_at ASC)
            .find(|p| {
                matches!(
                    p.process_type,
                    crate::models::execution_process::ExecutionProcessType::CodingAgent
                )
            })
            .ok_or_else(|| {
                tracing::error!(
                    "No previous coding agent execution found for task attempt {}. Found {} processes: {:?}",
                    attempt_id,
                    execution_processes.len(),
                    execution_processes.iter().map(|p| format!("{:?}", p.process_type)).collect::<Vec<_>>()
                );
                TaskAttemptError::ValidationError("No previous coding agent execution found for follow-up".to_string())
            })?;

        // Get the executor session to find the session ID
        // This looks up the session from the original attempt's processes
        let executor_session =
            ExecutorSession::find_by_execution_process_id(pool, most_recent_coding_agent.id)
                .await?
                .ok_or_else(|| {
                    tracing::error!(
                        "No executor session found for execution process {} (task attempt {})",
                        most_recent_coding_agent.id,
                        attempt_id
                    );
                    TaskAttemptError::ValidationError(
                        "No executor session found for follow-up".to_string(),
                    )
                })?;

        // Determine the executor config from the stored executor_type
        let executor_config = match most_recent_coding_agent.executor_type.as_deref() {
            Some("claude") => crate::executor::ExecutorConfig::Claude,
            Some("amp") => crate::executor::ExecutorConfig::Amp,
            Some("gemini") => crate::executor::ExecutorConfig::Gemini,
            Some("echo") => crate::executor::ExecutorConfig::Echo,
            Some("opencode") => crate::executor::ExecutorConfig::Opencode,
            _ => {
                tracing::error!(
                    "Invalid or missing executor type '{}' for execution process {} (task attempt {})",
                    most_recent_coding_agent.executor_type.as_deref().unwrap_or("None"),
                    most_recent_coding_agent.id,
                    attempt_id
                );
                return Err(TaskAttemptError::ValidationError(format!(
                    "Invalid executor type for follow-up: {}",
                    most_recent_coding_agent
                        .executor_type
                        .as_deref()
                        .unwrap_or("None")
                )));
            }
        };

        // Try to use follow-up with session ID, but fall back to new session if it fails
        let followup_executor = if let Some(session_id) = &executor_session.session_id {
            // First try with session ID for continuation
            debug!(
                "SESSION_FOLLOWUP: Attempting follow-up execution with session ID: {} (attempt: {}, worktree: {})",
                session_id, attempt_id, worktree_path
            );
            crate::executor::ExecutorType::FollowUpCodingAgent {
                config: executor_config.clone(),
                session_id: executor_session.session_id.clone(),
                prompt: prompt.to_string(),
            }
        } else {
            // No session ID available, start new session
            tracing::warn!(
                "SESSION_FOLLOWUP: No session ID available for follow-up execution on attempt {}, starting new session (worktree: {})",
                attempt_id, worktree_path
            );
            crate::executor::ExecutorType::CodingAgent(executor_config.clone())
        };

        // Try to start the follow-up execution
        let execution_result = Self::start_process_execution(
            pool,
            app_state,
            actual_attempt_id,
            task_id,
            followup_executor,
            "Starting follow-up executor".to_string(),
            TaskAttemptStatus::ExecutorRunning,
            crate::models::execution_process::ExecutionProcessType::CodingAgent,
            &worktree_path,
        )
        .await;

        // If follow-up execution failed and we tried to use a session ID,
        // fall back to a new session
        if execution_result.is_err() && executor_session.session_id.is_some() {
            tracing::warn!(
                "SESSION_FOLLOWUP: Follow-up execution with session ID '{}' failed for attempt {}, falling back to new session. Error: {:?}",
                executor_session.session_id.as_ref().unwrap(),
                attempt_id,
                execution_result.as_ref().err()
            );

            // Create a new session instead of trying to resume
            let new_session_executor = crate::executor::ExecutorType::CodingAgent(executor_config);

            Self::start_process_execution(
                pool,
                app_state,
                actual_attempt_id,
                task_id,
                new_session_executor,
                "Starting new executor session (follow-up session failed)".to_string(),
                TaskAttemptStatus::ExecutorRunning,
                crate::models::execution_process::ExecutionProcessType::CodingAgent,
                &worktree_path,
            )
            .await?;
        } else {
            // Either it succeeded or we already tried without session ID
            execution_result?;
        }

        Ok(actual_attempt_id)
    }

    /// Ensure worktree exists, recreating from branch if needed (cold task support)
    async fn ensure_worktree_exists(
        pool: &SqlitePool,
        attempt_id: Uuid,
        project_id: Uuid,
        context: &str,
    ) -> Result<String, TaskAttemptError> {
        let task_attempt = TaskAttempt::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        // Return existing path if worktree still exists
        if std::path::Path::new(&task_attempt.worktree_path).exists() {
            return Ok(task_attempt.worktree_path);
        }

        // Recreate worktree from branch
        info!(
            "Worktree {} no longer exists, recreating from branch {} for {}",
            task_attempt.worktree_path, task_attempt.branch, context
        );

        let new_worktree_path =
            Self::recreate_worktree_from_branch(pool, &task_attempt, project_id).await?;

        // Update database with new path and reset worktree_deleted flag
        sqlx::query!(
            "UPDATE task_attempts SET worktree_path = $1, worktree_deleted = FALSE, updated_at = datetime('now') WHERE id = $2",
            new_worktree_path,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(new_worktree_path)
    }

    /// Recreate a worktree from an existing branch (for cold task support)
    async fn recreate_worktree_from_branch(
        pool: &SqlitePool,
        task_attempt: &TaskAttempt,
        project_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Create GitService instance
        let git_service = GitService::new(&project.git_repo_path)?;

        // Use the stored worktree path from database - this ensures we recreate in the exact same location
        // where Claude originally created its session, maintaining session continuity
        let stored_worktree_path = std::path::PathBuf::from(&task_attempt.worktree_path);

        let result_path = git_service
            .recreate_worktree_from_branch(&task_attempt.branch, &stored_worktree_path)
            .await?;

        Ok(result_path.to_string_lossy().to_string())
    }

    /// Resolve executor configuration from string name
    fn resolve_executor_config(executor_name: &Option<String>) -> crate::executor::ExecutorConfig {
        match executor_name.as_ref().map(|s| s.as_str()) {
            Some("claude") => crate::executor::ExecutorConfig::Claude,
            Some("amp") => crate::executor::ExecutorConfig::Amp,
            Some("gemini") => crate::executor::ExecutorConfig::Gemini,
            Some("opencode") => crate::executor::ExecutorConfig::Opencode,
            _ => crate::executor::ExecutorConfig::Echo, // Default for "echo" or None
        }
    }

    /// Unified function to start any type of process execution
    #[allow(clippy::too_many_arguments)]
    async fn start_process_execution(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        executor_type: crate::executor::ExecutorType,
        activity_note: String,
        activity_status: TaskAttemptStatus,
        process_type: crate::models::execution_process::ExecutionProcessType,
        worktree_path: &str,
    ) -> Result<(), TaskAttemptError> {
        let process_id = Uuid::new_v4();

        // Create execution process record
        let _execution_process = Self::create_execution_process_record(
            pool,
            attempt_id,
            process_id,
            &executor_type,
            process_type.clone(),
            worktree_path,
        )
        .await?;

        // Create executor session for coding agents
        if matches!(
            process_type,
            crate::models::execution_process::ExecutionProcessType::CodingAgent
        ) {
            // Extract follow-up prompt if this is a follow-up execution
            let followup_prompt = match &executor_type {
                crate::executor::ExecutorType::FollowUpCodingAgent { prompt, .. } => {
                    Some(prompt.clone())
                }
                _ => None,
            };
            Self::create_executor_session_record(
                pool,
                attempt_id,
                task_id,
                process_id,
                followup_prompt,
            )
            .await?;
        }

        // Create activity record (skip for dev servers as they run in parallel)
        if !matches!(
            process_type,
            crate::models::execution_process::ExecutionProcessType::DevServer
        ) {
            Self::create_activity_record(pool, process_id, activity_status.clone(), &activity_note)
                .await?;
        }

        tracing::info!("Starting {} for task attempt {}", activity_note, attempt_id);

        // Execute the process
        let child = Self::execute_process(
            &executor_type,
            pool,
            task_id,
            attempt_id,
            process_id,
            worktree_path,
        )
        .await?;

        // Register for monitoring
        Self::register_for_monitoring(app_state, process_id, attempt_id, &process_type, child)
            .await;

        tracing::info!(
            "Started execution {} for task attempt {}",
            process_id,
            attempt_id
        );
        Ok(())
    }

    /// Create execution process database record
    async fn create_execution_process_record(
        pool: &SqlitePool,
        attempt_id: Uuid,
        process_id: Uuid,
        executor_type: &crate::executor::ExecutorType,
        process_type: crate::models::execution_process::ExecutionProcessType,
        worktree_path: &str,
    ) -> Result<crate::models::execution_process::ExecutionProcess, TaskAttemptError> {
        use crate::models::execution_process::{CreateExecutionProcess, ExecutionProcess};

        let (shell_cmd, shell_arg) = get_shell_command();
        let (command, args, executor_type_string) = match executor_type {
            crate::executor::ExecutorType::SetupScript(_) => (
                shell_cmd.to_string(),
                Some(serde_json::to_string(&[shell_arg, "setup_script"]).unwrap()),
                None, // Setup scripts don't have an executor type
            ),
            crate::executor::ExecutorType::DevServer(_) => (
                shell_cmd.to_string(),
                Some(serde_json::to_string(&[shell_arg, "dev_server"]).unwrap()),
                None, // Dev servers don't have an executor type
            ),
            crate::executor::ExecutorType::CodingAgent(config) => {
                let executor_type_str = match config {
                    crate::executor::ExecutorConfig::Echo => "echo",
                    crate::executor::ExecutorConfig::Claude => "claude",
                    crate::executor::ExecutorConfig::Amp => "amp",
                    crate::executor::ExecutorConfig::Gemini => "gemini",
                    crate::executor::ExecutorConfig::Opencode => "opencode",
                };
                (
                    "executor".to_string(),
                    None,
                    Some(executor_type_str.to_string()),
                )
            }
            crate::executor::ExecutorType::FollowUpCodingAgent { config, .. } => {
                let executor_type_str = match config {
                    crate::executor::ExecutorConfig::Echo => "echo",
                    crate::executor::ExecutorConfig::Claude => "claude",
                    crate::executor::ExecutorConfig::Amp => "amp",
                    crate::executor::ExecutorConfig::Gemini => "gemini",
                    crate::executor::ExecutorConfig::Opencode => "opencode",
                };
                (
                    "followup_executor".to_string(),
                    None,
                    Some(executor_type_str.to_string()),
                )
            }
        };

        let create_process = CreateExecutionProcess {
            task_attempt_id: attempt_id,
            process_type,
            executor_type: executor_type_string,
            command,
            args,
            working_directory: worktree_path.to_string(),
        };

        ExecutionProcess::create(pool, &create_process, process_id)
            .await
            .map_err(TaskAttemptError::from)
    }

    /// Create executor session record for coding agents
    async fn create_executor_session_record(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        process_id: Uuid,
        followup_prompt: Option<String>,
    ) -> Result<(), TaskAttemptError> {
        use crate::models::executor_session::{CreateExecutorSession, ExecutorSession};

        // Use follow-up prompt if provided, otherwise get the task to create prompt
        let prompt = if let Some(followup_prompt) = followup_prompt {
            followup_prompt
        } else {
            let task = Task::find_by_id(pool, task_id)
                .await?
                .ok_or(TaskAttemptError::TaskNotFound)?;
            format!("{}\n\n{}", task.title, task.description.unwrap_or_default())
        };

        let session_id = Uuid::new_v4();
        let create_session = CreateExecutorSession {
            task_attempt_id: attempt_id,
            execution_process_id: process_id,
            prompt: Some(prompt),
        };

        ExecutorSession::create(pool, &create_session, session_id)
            .await
            .map(|_| ())
            .map_err(TaskAttemptError::from)
    }

    /// Create activity record for process start
    async fn create_activity_record(
        pool: &SqlitePool,
        process_id: Uuid,
        activity_status: TaskAttemptStatus,
        activity_note: &str,
    ) -> Result<(), TaskAttemptError> {
        use crate::models::task_attempt_activity::{
            CreateTaskAttemptActivity, TaskAttemptActivity,
        };

        let activity_id = Uuid::new_v4();
        let create_activity = CreateTaskAttemptActivity {
            execution_process_id: process_id,
            status: Some(activity_status.clone()),
            note: Some(activity_note.to_string()),
        };

        TaskAttemptActivity::create(pool, &create_activity, activity_id, activity_status)
            .await
            .map(|_| ())
            .map_err(TaskAttemptError::from)
    }

    /// Execute the process based on type
    async fn execute_process(
        executor_type: &crate::executor::ExecutorType,
        pool: &SqlitePool,
        task_id: Uuid,
        attempt_id: Uuid,
        process_id: Uuid,
        worktree_path: &str,
    ) -> Result<command_group::AsyncGroupChild, TaskAttemptError> {
        use crate::executors::{DevServerExecutor, SetupScriptExecutor};

        let result = match executor_type {
            crate::executor::ExecutorType::SetupScript(script) => {
                let executor = SetupScriptExecutor {
                    script: script.clone(),
                };
                executor
                    .execute_streaming(pool, task_id, attempt_id, process_id, worktree_path)
                    .await
            }
            crate::executor::ExecutorType::DevServer(script) => {
                let executor = DevServerExecutor {
                    script: script.clone(),
                };
                executor
                    .execute_streaming(pool, task_id, attempt_id, process_id, worktree_path)
                    .await
            }
            crate::executor::ExecutorType::CodingAgent(config) => {
                let executor = config.create_executor();
                executor
                    .execute_streaming(pool, task_id, attempt_id, process_id, worktree_path)
                    .await
            }
            crate::executor::ExecutorType::FollowUpCodingAgent {
                config,
                session_id,
                prompt,
            } => {
                use crate::executors::{
                    AmpFollowupExecutor, ClaudeFollowupExecutor, GeminiFollowupExecutor,
                    OpencodeFollowupExecutor,
                };

                let executor: Box<dyn crate::executor::Executor> = match config {
                    crate::executor::ExecutorConfig::Claude => {
                        if let Some(sid) = session_id {
                            Box::new(ClaudeFollowupExecutor {
                                session_id: sid.clone(),
                                prompt: prompt.clone(),
                            })
                        } else {
                            return Err(TaskAttemptError::TaskNotFound); // No session ID for followup
                        }
                    }
                    crate::executor::ExecutorConfig::Amp => {
                        if let Some(tid) = session_id {
                            Box::new(AmpFollowupExecutor {
                                thread_id: tid.clone(),
                                prompt: prompt.clone(),
                            })
                        } else {
                            return Err(TaskAttemptError::TaskNotFound); // No thread ID for followup
                        }
                    }
                    crate::executor::ExecutorConfig::Gemini => {
                        if let Some(sid) = session_id {
                            Box::new(GeminiFollowupExecutor {
                                session_id: sid.clone(),
                                prompt: prompt.clone(),
                            })
                        } else {
                            return Err(TaskAttemptError::TaskNotFound); // No session ID for followup
                        }
                    }
                    crate::executor::ExecutorConfig::Echo => {
                        // Echo doesn't support followup, use regular echo
                        config.create_executor()
                    }
                    crate::executor::ExecutorConfig::Opencode => {
                        if let Some(sid) = session_id {
                            Box::new(OpencodeFollowupExecutor {
                                session_id: sid.clone(),
                                prompt: prompt.clone(),
                            })
                        } else {
                            return Err(TaskAttemptError::TaskNotFound); // No session ID for followup
                        }
                    }
                };

                executor
                    .execute_streaming(pool, task_id, attempt_id, process_id, worktree_path)
                    .await
            }
        };

        result.map_err(|e| TaskAttemptError::Git(git2::Error::from_str(&e.to_string())))
    }

    /// Register process for monitoring
    async fn register_for_monitoring(
        app_state: &crate::app_state::AppState,
        process_id: Uuid,
        attempt_id: Uuid,
        process_type: &crate::models::execution_process::ExecutionProcessType,
        child: command_group::AsyncGroupChild,
    ) {
        let execution_type = match process_type {
            crate::models::execution_process::ExecutionProcessType::SetupScript => {
                crate::app_state::ExecutionType::SetupScript
            }
            crate::models::execution_process::ExecutionProcessType::CodingAgent => {
                crate::app_state::ExecutionType::CodingAgent
            }
            crate::models::execution_process::ExecutionProcessType::DevServer => {
                crate::app_state::ExecutionType::DevServer
            }
        };

        app_state
            .add_running_execution(
                process_id,
                crate::app_state::RunningExecution {
                    task_attempt_id: attempt_id,
                    _execution_type: execution_type,
                    child,
                },
            )
            .await;
    }

    /// Get the git diff between the base commit and the current committed worktree state
    pub async fn get_diff(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<WorktreeDiff, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.worktree_path,
                       ta.branch,
                       ta.base_branch,
                       ta.merge_commit,
                       ta.executor,
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               WHERE   ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Get the project to access the main repository
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Create GitService instance
        let git_service = GitService::new(&project.git_repo_path)?;

        if let Some(merge_commit_id) = &attempt.merge_commit {
            // Task attempt has been merged - show the diff from the merge commit
            git_service.get_enhanced_diff(Path::new(""), Some(merge_commit_id))
                .map_err(TaskAttemptError::from)
        } else {
            // Task attempt not yet merged - get worktree diff
            // Ensure worktree exists (recreate if needed for cold task support)
            let worktree_path =
                Self::ensure_worktree_exists(pool, attempt_id, project_id, "diff").await?;

            git_service.get_enhanced_diff(Path::new(&worktree_path), None)
                .map_err(TaskAttemptError::from)
        }
    }



    /// Get the branch status for this task attempt
    pub async fn get_branch_status(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<BranchStatus, TaskAttemptError> {
        // ── fetch the task attempt ───────────────────────────────────────────────────
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"
            SELECT  ta.id                AS "id!: Uuid",
                    ta.task_id           AS "task_id!: Uuid",
                    ta.worktree_path,
                    ta.branch,
                    ta.base_branch,
                    ta.merge_commit,
                    ta.executor,
                    ta.pr_url,
                    ta.pr_number,
                    ta.pr_status,
                    ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                    ta.worktree_deleted as "worktree_deleted!: bool",
                    ta.created_at        AS "created_at!: DateTime<Utc>",
                    ta.updated_at        AS "updated_at!: DateTime<Utc>"
            FROM    task_attempts ta
            JOIN    tasks t ON ta.task_id = t.id
            WHERE   ta.id = $1
              AND   t.id  = $2
              AND   t.project_id = $3
        "#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // ── fetch the owning project & open its repository ───────────────────────────
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        use git2::{Status, StatusOptions};

        // Ensure worktree exists (recreate if needed for cold task support)
        let main_repo = Repository::open(&project.git_repo_path)?;
        let attempt_branch = attempt.branch.clone();

        // ── locate the commit pointed to by the attempt branch ───────────────────────
        let attempt_ref = main_repo
            // try "refs/heads/<name>" first, then raw name
            .find_reference(&format!("refs/heads/{}", attempt_branch))
            .or_else(|_| main_repo.find_reference(&attempt_branch))?;
        let attempt_oid = attempt_ref.target().unwrap();

        // ── determine the base branch & ahead/behind counts ─────────────────────────
        let base_branch_name = attempt.base_branch.clone();

        // 1. prefer the branch’s configured upstream, if any
        if let Ok(local_branch) = main_repo.find_branch(&attempt_branch, BranchType::Local) {
            if let Ok(upstream) = local_branch.upstream() {
                if let Some(_name) = upstream.name()? {
                    if let Some(base_oid) = upstream.get().target() {
                        let (_ahead, _behind) =
                            main_repo.graph_ahead_behind(attempt_oid, base_oid)?;
                        // Ignore upstream since we use stored base branch
                    }
                }
            }
        }

        // Calculate ahead/behind counts using the stored base branch
        let (commits_ahead, commits_behind) =
            if let Ok(base_branch) = main_repo.find_branch(&base_branch_name, BranchType::Local) {
                if let Some(base_oid) = base_branch.get().target() {
                    main_repo.graph_ahead_behind(attempt_oid, base_oid)?
                } else {
                    (0, 0) // Base branch has no commits
                }
            } else {
                // Base branch doesn't exist, assume no relationship
                (0, 0)
            };

        // ── detect any uncommitted / untracked changes ───────────────────────────────
        let repo_for_status = Repository::open(&project.git_repo_path)?;

        let mut status_opts = StatusOptions::new();
        status_opts
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false);

        let has_uncommitted_changes = repo_for_status
            .statuses(Some(&mut status_opts))?
            .iter()
            .any(|e| e.status() != Status::CURRENT);

        // ── assemble & return ────────────────────────────────────────────────────────
        Ok(BranchStatus {
            is_behind: commits_behind > 0,
            commits_behind,
            commits_ahead,
            up_to_date: commits_behind == 0 && commits_ahead == 0,
            merged: attempt.merge_commit.is_some(),
            has_uncommitted_changes,
            base_branch_name,
        })
    }

    /// Rebase the worktree branch onto specified base branch (or current HEAD if none specified)
    pub async fn rebase_attempt(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
        new_base_branch: Option<String>,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.worktree_path,
                       ta.branch,
                       ta.base_branch,
                       ta.merge_commit,
                       ta.executor,
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               WHERE   ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Get the project
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Use the stored base branch if no new base branch is provided
        let effective_base_branch = new_base_branch.or_else(|| Some(attempt.base_branch.clone()));

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "rebase").await?;

        // Perform the git rebase operations (synchronous)
        let new_base_commit = Self::perform_rebase_operation(
            &worktree_path,
            &project.git_repo_path,
            effective_base_branch,
        )?;

        // No need to update database as we now get base_commit live from git
        Ok(new_base_commit)
    }

    /// Delete a file from the worktree and commit the change
    pub async fn delete_file(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
        file_path: &str,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with validation
        let _attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.worktree_path,
                       ta.branch,
                       ta.base_branch,
                       ta.merge_commit,
                       ta.executor,
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               WHERE   ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path_str =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "delete file").await?;

        // Get the project to access GitService
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Create GitService instance
        let git_service = GitService::new(&project.git_repo_path)?;

        // Use GitService to delete file and commit
        let commit_id = git_service
            .delete_file_and_commit(Path::new(&worktree_path_str), file_path)?;

        Ok(commit_id)
    }

    /// Create a GitHub PR for this task attempt
    pub async fn create_github_pr(
        pool: &SqlitePool,
        params: CreatePrParams<'_>,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.worktree_path,
                       ta.branch,
                       ta.base_branch,
                       ta.merge_commit,
                       ta.executor,
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               WHERE   ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            params.attempt_id,
            params.task_id,
            params.project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Get the project to access the repository path
        let project = Project::find_by_id(pool, params.project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, params.attempt_id, params.project_id, "GitHub PR")
                .await?;

        // Create GitHub service instance
        let github_service = GitHubService::new(params.github_token)?;

        // Extract GitHub repository information from the project path
        let repo_info = GitHubService::extract_repo_info(&project.git_repo_path)?;

        // Push the branch to GitHub first
        Self::push_branch_to_github(&project.git_repo_path, &worktree_path, &attempt.branch, params.github_token)?;

        // Create the PR using GitHub service
        let pr_request = CreatePrRequest {
            title: params.title.to_string(),
            body: params.body.map(|s| s.to_string()),
            head_branch: attempt.branch.clone(),
            base_branch: params.base_branch.unwrap_or("main").to_string(),
        };

        let pr_info = github_service.create_pr(&repo_info, &pr_request).await?;

        // Update the task attempt with PR information
        sqlx::query!(
            "UPDATE task_attempts SET pr_url = $1, pr_number = $2, pr_status = $3, updated_at = datetime('now') WHERE id = $4",
            pr_info.url,
            pr_info.number,
            pr_info.status,
            params.attempt_id
        )
        .execute(pool)
        .await?;

        Ok(pr_info.url)
    }



    /// Push the branch to GitHub remote
    fn push_branch_to_github(
        git_repo_path: &str,
        worktree_path: &str,
        branch_name: &str,
        github_token: &str,
    ) -> Result<(), TaskAttemptError> {
        // Use GitService to push to GitHub
        let git_service = GitService::new(git_repo_path)?;
        git_service.push_to_github(Path::new(worktree_path), branch_name, github_token)
            .map_err(TaskAttemptError::from)
    }



    /// Update PR status and merge commit
    pub async fn update_pr_status(
        pool: &SqlitePool,
        attempt_id: Uuid,
        status: &str,
        merged_at: Option<DateTime<Utc>>,
        merge_commit_sha: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_attempts SET pr_status = $1, pr_merged_at = $2, merge_commit = $3, updated_at = datetime('now') WHERE id = $4",
            status,
            merged_at,
            merge_commit_sha,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Get the current execution state for a task attempt
    pub async fn get_execution_state(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<TaskAttemptState, TaskAttemptError> {
        // Get the task attempt with validation
        let _attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT  ta.id                AS "id!: Uuid",
                       ta.task_id           AS "task_id!: Uuid",
                       ta.worktree_path,
                       ta.branch,
                       ta.base_branch,
                       ta.merge_commit,
                       ta.executor,
                       ta.pr_url,
                       ta.pr_number,
                       ta.pr_status,
                       ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
                       ta.worktree_deleted  AS "worktree_deleted!: bool",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               WHERE   ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Get the project to check if it has a setup script
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        let has_setup_script = project
            .setup_script
            .as_ref()
            .map(|script| !script.trim().is_empty())
            .unwrap_or(false);

        // Get all execution processes for this attempt, ordered by created_at
        let processes =
            crate::models::execution_process::ExecutionProcess::find_by_task_attempt_id(
                pool, attempt_id,
            )
            .await?;

        // Find setup and coding agent processes
        let setup_process = processes.iter().find(|p| {
            matches!(
                p.process_type,
                crate::models::execution_process::ExecutionProcessType::SetupScript
            )
        });

        let coding_agent_process = processes.iter().find(|p| {
            matches!(
                p.process_type,
                crate::models::execution_process::ExecutionProcessType::CodingAgent
            )
        });

        // Determine execution state based on processes
        let execution_state = if let Some(setup) = setup_process {
            match setup.status {
                crate::models::execution_process::ExecutionProcessStatus::Running => {
                    ExecutionState::SetupRunning
                }
                crate::models::execution_process::ExecutionProcessStatus::Completed => {
                    if let Some(agent) = coding_agent_process {
                        match agent.status {
                            crate::models::execution_process::ExecutionProcessStatus::Running => {
                                ExecutionState::CodingAgentRunning
                            }
                            crate::models::execution_process::ExecutionProcessStatus::Completed => {
                                ExecutionState::CodingAgentComplete
                            }
                            crate::models::execution_process::ExecutionProcessStatus::Failed => {
                                ExecutionState::CodingAgentFailed
                            }
                            crate::models::execution_process::ExecutionProcessStatus::Killed => {
                                ExecutionState::CodingAgentFailed
                            }
                        }
                    } else {
                        ExecutionState::SetupComplete
                    }
                }
                crate::models::execution_process::ExecutionProcessStatus::Failed => {
                    ExecutionState::SetupFailed
                }
                crate::models::execution_process::ExecutionProcessStatus::Killed => {
                    ExecutionState::SetupFailed
                }
            }
        } else if let Some(agent) = coding_agent_process {
            // No setup script, only coding agent
            match agent.status {
                crate::models::execution_process::ExecutionProcessStatus::Running => {
                    ExecutionState::CodingAgentRunning
                }
                crate::models::execution_process::ExecutionProcessStatus::Completed => {
                    ExecutionState::CodingAgentComplete
                }
                crate::models::execution_process::ExecutionProcessStatus::Failed => {
                    ExecutionState::CodingAgentFailed
                }
                crate::models::execution_process::ExecutionProcessStatus::Killed => {
                    ExecutionState::CodingAgentFailed
                }
            }
        } else {
            // No processes started yet
            ExecutionState::NotStarted
        };

        // Check if there are any changes (quick diff check)
        let has_changes = match Self::get_diff(pool, attempt_id, task_id, project_id).await {
            Ok(diff) => !diff.files.is_empty(),
            Err(_) => false, // If diff fails, assume no changes
        };

        Ok(TaskAttemptState {
            execution_state,
            has_changes,
            has_setup_script,
            setup_process_id: setup_process.map(|p| p.id.to_string()),
            coding_agent_process_id: coding_agent_process.map(|p| p.id.to_string()),
        })
    }
}
