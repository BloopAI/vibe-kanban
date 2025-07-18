use std::path::Path;

use chrono::{DateTime, Utc};
use git2::{BranchType, Error as GitError, Repository};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use tracing::info;
use ts_rs::TS;
use uuid::Uuid;

use super::{project::Project, task::Task};
use crate::services::{
    CreatePrRequest, GitHubRepoInfo, GitHubService, GitHubServiceError, GitService,
    GitServiceError, ProcessService,
};

// Constants for git diff operations
const GIT_DIFF_CONTEXT_LINES: u32 = 3;
const GIT_DIFF_INTERHUNK_LINES: u32 = 0;

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
            TaskAttemptError::BranchNotFound(branch) => write!(f, "Branch '{}' not found", branch),
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
    pub setup_completed_at: Option<DateTime<Utc>>, // When setup script was last completed
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
    SetupStopped,
    CodingAgentRunning,
    CodingAgentComplete,
    CodingAgentFailed,
    CodingAgentStopped,
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

/// Context data for resume operations (simplified)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptResumeContext {
    pub execution_history: String,
    pub cumulative_diffs: String,
}

#[derive(Debug)]
pub struct TaskAttemptContext {
    pub task_attempt: TaskAttempt,
    pub task: Task,
    pub project: Project,
}

impl TaskAttempt {
    /// Load task attempt with full validation - ensures task_attempt belongs to task and task belongs to project
    pub async fn load_context(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<TaskAttemptContext, TaskAttemptError> {
        // Single query with JOIN validation to ensure proper relationships
        let task_attempt = sqlx::query_as!(
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
                       ta.setup_completed_at AS "setup_completed_at: DateTime<Utc>",
                       ta.created_at        AS "created_at!: DateTime<Utc>",
                       ta.updated_at        AS "updated_at!: DateTime<Utc>"
               FROM    task_attempts ta
               JOIN    tasks t ON ta.task_id = t.id
               JOIN    projects p ON t.project_id = p.id
               WHERE   ta.id = $1 AND t.id = $2 AND p.id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Load task and project (we know they exist due to JOIN validation)
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        Ok(TaskAttemptContext {
            task_attempt,
            task,
            project,
        })
    }

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
        let dir_name = if cfg!(debug_assertions) {
            "vibe-kanban-dev"
        } else {
            "vibe-kanban"
        };

        if cfg!(target_os = "macos") {
            // macOS already uses /var/folders/... which is persistent storage
            std::env::temp_dir().join(dir_name)
        } else if cfg!(target_os = "linux") {
            // Linux: use /var/tmp instead of /tmp to avoid RAM usage
            std::path::PathBuf::from("/var/tmp").join(dir_name)
        } else {
            // Windows and other platforms: use temp dir with vibe-kanban subdirectory
            std::env::temp_dir().join(dir_name)
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
                       setup_completed_at AS "setup_completed_at: DateTime<Utc>",
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
                       setup_completed_at AS "setup_completed_at: DateTime<Utc>",
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

    /// Find task attempts that are expired (24+ hours since last activity) and eligible for worktree cleanup
    /// Activity includes: execution completion, task attempt updates (including worktree recreation),
    /// and any attempts that are currently in progress
    pub async fn find_expired_for_cleanup(
        pool: &SqlitePool,
    ) -> Result<Vec<(Uuid, String, String)>, sqlx::Error> {
        let records = sqlx::query!(
            r#"
            SELECT ta.id as "attempt_id!: Uuid", ta.worktree_path, p.git_repo_path as "git_repo_path!"
            FROM task_attempts ta
            LEFT JOIN execution_processes ep ON ta.id = ep.task_attempt_id AND ep.completed_at IS NOT NULL
            JOIN tasks t ON ta.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            WHERE ta.worktree_deleted = FALSE
                -- Exclude attempts with any running processes (in progress)
                AND ta.id NOT IN (
                    SELECT DISTINCT ep2.task_attempt_id
                    FROM execution_processes ep2
                    WHERE ep2.completed_at IS NULL
                )
            GROUP BY ta.id, ta.worktree_path, p.git_repo_path, ta.updated_at
            HAVING datetime('now', '-24 hours') > datetime(
                MAX(
                    CASE
                        WHEN ep.completed_at IS NOT NULL THEN ep.completed_at
                        ELSE ta.updated_at
                    END
                )
            )
            ORDER BY MAX(
                CASE
                    WHEN ep.completed_at IS NOT NULL THEN ep.completed_at
                    ELSE ta.updated_at
                END
            ) ASC
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
            r#"INSERT INTO task_attempts (id, task_id, worktree_path, branch, base_branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at, worktree_deleted, setup_completed_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, branch, base_branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at as "pr_merged_at: DateTime<Utc>", worktree_deleted as "worktree_deleted!: bool", setup_completed_at as "setup_completed_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
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
            false, // worktree_deleted is false during creation
            Option::<DateTime<Utc>>::None // setup_completed_at is None during creation
        )
        .fetch_one(pool)
        .await?)
    }

    /// Perform the actual merge operation using GitService
    fn perform_merge_operation(
        worktree_path: &str,
        main_repo_path: &str,
        branch_name: &str,
        base_branch: &str,
        task_title: &str,
        task_description: &Option<String>,
        task_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        let git_service = GitService::new(main_repo_path)?;
        let worktree_path = Path::new(worktree_path);

        // Extract first section of UUID (before first hyphen)
        let task_uuid_str = task_id.to_string();
        let first_uuid_section = task_uuid_str.split('-').next().unwrap_or(&task_uuid_str);

        // Create commit message with task title and description
        let mut commit_message = format!("{} (vibe-kanban {})", task_title, first_uuid_section);

        // Add description on next line if it exists
        if let Some(description) = task_description {
            if !description.trim().is_empty() {
                commit_message.push_str("\n\n");
                commit_message.push_str(description);
            }
        }

        git_service
            .merge_changes(worktree_path, branch_name, base_branch, &commit_message)
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

        git_service
            .rebase_branch(worktree_path, new_base_branch.as_deref())
            .map_err(TaskAttemptError::from)
    }

    /// Merge the worktree changes back to the main repository
    pub async fn merge_changes(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        // Load context with full validation
        let ctx = TaskAttempt::load_context(pool, attempt_id, task_id, project_id).await?;

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "merge").await?;

        // Perform the actual merge operation
        let merge_commit_id = Self::perform_merge_operation(
            &worktree_path,
            &ctx.project.git_repo_path,
            &ctx.task_attempt.branch,
            &ctx.task_attempt.base_branch,
            &ctx.task.title,
            &ctx.task.description,
            ctx.task.id,
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
        ProcessService::start_execution(pool, app_state, attempt_id, task_id, project_id).await
    }

    /// Start a dev server for this task attempt
    pub async fn start_dev_server(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<(), TaskAttemptError> {
        ProcessService::start_dev_server(pool, app_state, attempt_id, task_id, project_id).await
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
        ProcessService::start_followup_execution(
            pool, app_state, attempt_id, task_id, project_id, prompt,
        )
        .await
    }

    /// Ensure worktree exists, recreating from branch if needed (cold task support)
    pub async fn ensure_worktree_exists(
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

        // Update database with new path, reset worktree_deleted flag, and clear setup completion
        sqlx::query!(
            "UPDATE task_attempts SET worktree_path = $1, worktree_deleted = FALSE, setup_completed_at = NULL, updated_at = datetime('now') WHERE id = $2",
            new_worktree_path,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(new_worktree_path)
    }

    /// Recreate a worktree from an existing branch (for cold task support)
    pub async fn recreate_worktree_from_branch(
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

    /// Get the git diff between the base commit and the current committed worktree state
    pub async fn get_diff(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<WorktreeDiff, TaskAttemptError> {
        // Load context with full validation
        let ctx = TaskAttempt::load_context(pool, attempt_id, task_id, project_id).await?;

        // Create GitService instance
        let git_service = GitService::new(&ctx.project.git_repo_path)?;

        if let Some(merge_commit_id) = &ctx.task_attempt.merge_commit {
            // Task attempt has been merged - show the diff from the merge commit
            git_service
                .get_enhanced_diff(
                    Path::new(""),
                    Some(merge_commit_id),
                    &ctx.task_attempt.base_branch,
                )
                .map_err(TaskAttemptError::from)
        } else {
            // Task attempt not yet merged - get worktree diff
            // Ensure worktree exists (recreate if needed for cold task support)
            let worktree_path =
                Self::ensure_worktree_exists(pool, attempt_id, project_id, "diff").await?;

            git_service
                .get_enhanced_diff(
                    Path::new(&worktree_path),
                    None,
                    &ctx.task_attempt.base_branch,
                )
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
        // Load context with full validation
        let ctx = TaskAttempt::load_context(pool, attempt_id, task_id, project_id).await?;

        use git2::{Status, StatusOptions};

        // Ensure worktree exists (recreate if needed for cold task support)
        let main_repo = Repository::open(&ctx.project.git_repo_path)?;
        let attempt_branch = ctx.task_attempt.branch.clone();

        // ── locate the commit pointed to by the attempt branch ───────────────────────
        let attempt_ref = main_repo
            // try "refs/heads/<name>" first, then raw name
            .find_reference(&format!("refs/heads/{}", attempt_branch))
            .or_else(|_| main_repo.find_reference(&attempt_branch))?;
        let attempt_oid = attempt_ref.target().unwrap();

        // ── determine the base branch & ahead/behind counts ─────────────────────────
        let base_branch_name = ctx.task_attempt.base_branch.clone();

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
        let repo_for_status = Repository::open(&ctx.project.git_repo_path)?;

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
            merged: ctx.task_attempt.merge_commit.is_some(),
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
        // Load context with full validation
        let ctx = TaskAttempt::load_context(pool, attempt_id, task_id, project_id).await?;

        // Use the stored base branch if no new base branch is provided
        let effective_base_branch =
            new_base_branch.or_else(|| Some(ctx.task_attempt.base_branch.clone()));

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "rebase").await?;

        // Perform the git rebase operations (synchronous)
        let new_base_commit = Self::perform_rebase_operation(
            &worktree_path,
            &ctx.project.git_repo_path,
            effective_base_branch.clone(),
        )?;

        // Update the database with the new base branch if it was changed
        if let Some(new_base_branch) = &effective_base_branch {
            if new_base_branch != &ctx.task_attempt.base_branch {
                // For remote branches, store the local branch name in the database
                let db_branch_name = if new_base_branch.starts_with("origin/") {
                    new_base_branch.strip_prefix("origin/").unwrap()
                } else {
                    new_base_branch
                };

                sqlx::query!(
                    "UPDATE task_attempts SET base_branch = $1, updated_at = datetime('now') WHERE id = $2",
                    db_branch_name,
                    attempt_id
                )
                .execute(pool)
                .await?;
            }
        }

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
        // Load context with full validation
        let ctx = TaskAttempt::load_context(pool, attempt_id, task_id, project_id).await?;

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path_str =
            Self::ensure_worktree_exists(pool, attempt_id, project_id, "delete file").await?;

        // Create GitService instance
        let git_service = GitService::new(&ctx.project.git_repo_path)?;

        // Use GitService to delete file and commit
        let commit_id =
            git_service.delete_file_and_commit(Path::new(&worktree_path_str), file_path)?;

        Ok(commit_id)
    }

    /// Create a GitHub PR for this task attempt
    pub async fn create_github_pr(
        pool: &SqlitePool,
        params: CreatePrParams<'_>,
    ) -> Result<String, TaskAttemptError> {
        // Load context with full validation
        let ctx =
            TaskAttempt::load_context(pool, params.attempt_id, params.task_id, params.project_id)
                .await?;

        // Ensure worktree exists (recreate if needed for cold task support)
        let worktree_path =
            Self::ensure_worktree_exists(pool, params.attempt_id, params.project_id, "GitHub PR")
                .await?;

        // Create GitHub service instance
        let github_service = GitHubService::new(params.github_token)?;

        // Use GitService to get the remote URL, then create GitHubRepoInfo
        let git_service = GitService::new(&ctx.project.git_repo_path)?;
        let (owner, repo_name) = git_service
            .get_github_repo_info()
            .map_err(|e| TaskAttemptError::ValidationError(e.to_string()))?;
        let repo_info = GitHubRepoInfo { owner, repo_name };

        // Push the branch to GitHub first
        Self::push_branch_to_github(
            &ctx.project.git_repo_path,
            &worktree_path,
            &ctx.task_attempt.branch,
            params.github_token,
        )?;

        // Create the PR using GitHub service
        let pr_request = CreatePrRequest {
            title: params.title.to_string(),
            body: params.body.map(|s| s.to_string()),
            head_branch: ctx.task_attempt.branch.clone(),
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
        git_service
            .push_to_github(Path::new(worktree_path), branch_name, github_token)
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
        // Load context with full validation
        let ctx = TaskAttempt::load_context(pool, attempt_id, task_id, project_id).await?;

        let has_setup_script = ctx
            .project
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
                                ExecutionState::CodingAgentStopped
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
                    ExecutionState::SetupStopped
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
                    ExecutionState::CodingAgentStopped
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

    /// Check if setup script has been completed for this worktree
    pub async fn is_setup_completed(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<bool, TaskAttemptError> {
        let task_attempt = Self::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        Ok(task_attempt.setup_completed_at.is_some())
    }

    /// Mark setup script as completed for this worktree
    pub async fn mark_setup_completed(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<(), TaskAttemptError> {
        sqlx::query!(
            "UPDATE task_attempts SET setup_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Get execution history from current attempt only (simplified)
    pub async fn get_attempt_execution_history(
        pool: &SqlitePool,
        attempt_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        // Get all coding agent processes for this attempt
        let processes =
            crate::models::execution_process::ExecutionProcess::find_by_task_attempt_id(
                pool, attempt_id,
            )
            .await?;

        // Filter to coding agent processes only and aggregate stdout
        let coding_processes: Vec<_> = processes
            .into_iter()
            .filter(|p| {
                matches!(
                    p.process_type,
                    crate::models::execution_process::ExecutionProcessType::CodingAgent
                )
            })
            .collect();

        let mut history = String::new();
        for process in coding_processes {
            if let Some(stdout) = process.stdout {
                if !stdout.trim().is_empty() {
                    history.push_str(&stdout);
                    history.push('\n');
                }
            }
        }

        Ok(history)
    }

    /// Get diff between base_branch and current attempt (simplified)
    pub async fn get_attempt_diff(
        pool: &SqlitePool,
        attempt_id: Uuid,
        project_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with base_branch
        let attempt = Self::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        // Get the project
        let project = Project::find_by_id(pool, project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Open the main repository
        let repo = Repository::open(&project.git_repo_path)?;

        // Get base branch commit
        let base_branch = repo
            .find_branch(&attempt.base_branch, git2::BranchType::Local)
            .map_err(|_| TaskAttemptError::BranchNotFound(attempt.base_branch.clone()))?;
        let base_commit = base_branch.get().peel_to_commit()?;

        // Get current branch commit
        let current_branch = repo
            .find_branch(&attempt.branch, git2::BranchType::Local)
            .map_err(|_| TaskAttemptError::BranchNotFound(attempt.branch.clone()))?;
        let current_commit = current_branch.get().peel_to_commit()?;

        // Create diff between base and current
        let base_tree = base_commit.tree()?;
        let current_tree = current_commit.tree()?;

        let mut diff_opts = git2::DiffOptions::new();
        diff_opts.context_lines(GIT_DIFF_CONTEXT_LINES);
        diff_opts.interhunk_lines(GIT_DIFF_INTERHUNK_LINES);

        let diff =
            repo.diff_tree_to_tree(Some(&base_tree), Some(&current_tree), Some(&mut diff_opts))?;

        // Convert to text format
        let mut diff_text = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let content = std::str::from_utf8(line.content()).unwrap_or("");
            diff_text.push_str(&format!("{}{}", line.origin(), content));
            true
        })?;

        Ok(diff_text)
    }

    /// Get comprehensive resume context for Gemini followup execution (simplified)
    pub async fn get_attempt_resume_context(
        pool: &SqlitePool,
        attempt_id: Uuid,
        _task_id: Uuid,
        project_id: Uuid,
    ) -> Result<AttemptResumeContext, TaskAttemptError> {
        // Get execution history from current attempt only
        let execution_history = Self::get_attempt_execution_history(pool, attempt_id).await?;

        // Get diff between base_branch and current attempt
        let cumulative_diffs = Self::get_attempt_diff(pool, attempt_id, project_id).await?;

        Ok(AttemptResumeContext {
            execution_history,
            cumulative_diffs,
        })
    }
}
