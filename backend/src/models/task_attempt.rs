use std::path::Path;

use chrono::{DateTime, Utc};
use git2::{
    build::CheckoutBuilder, Error as GitError, MergeOptions, Oid, RebaseOptions, Repository,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use tracing::{debug, error, info};
use ts_rs::TS;
use uuid::Uuid;

use super::{project::Project, task::Task};
use crate::{executor::Executor, utils::shell::get_shell_command};

#[derive(Debug)]
pub enum TaskAttemptError {
    Database(sqlx::Error),
    Git(GitError),
    TaskNotFound,
    ProjectNotFound,
    ValidationError(String),
}

impl std::fmt::Display for TaskAttemptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskAttemptError::Database(e) => write!(f, "Database error: {}", e),
            TaskAttemptError::Git(e) => write!(f, "Git error: {}", e),
            TaskAttemptError::TaskNotFound => write!(f, "Task not found"),
            TaskAttemptError::ProjectNotFound => write!(f, "Project not found"),
            TaskAttemptError::ValidationError(e) => write!(f, "Validation error: {}", e),
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
    pub merge_commit: Option<String>,
    pub executor: Option<String>, // Name of the executor to use
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTaskAttempt {
    pub executor: Option<String>, // Optional executor name (defaults to "echo")
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTaskAttempt {
    // Currently no updateable fields, but keeping struct for API compatibility
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

impl TaskAttempt {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, merge_commit, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts 
               WHERE id = $1"#,
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
            r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, merge_commit, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts 
               WHERE task_id = $1 
               ORDER BY created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskAttempt,
        attempt_id: Uuid,
        task_id: Uuid,
    ) -> Result<Self, TaskAttemptError> {
        // First, get the task to get the project_id
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        // Then get the project using the project_id
        let project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Generate worktree path automatically using cross-platform temporary directory
        let temp_dir = std::env::temp_dir();
        let worktree_path = temp_dir.join(format!("mission-control-worktree-{}", attempt_id));
        let worktree_path_str = worktree_path.to_string_lossy().to_string();

        // Create the worktree using git2
        let repo = Repository::open(&project.git_repo_path)?;

        // We no longer store base_commit in the database - it's retrieved live via git2

        // Create the worktree directory if it doesn't exist
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| TaskAttemptError::Git(GitError::from_str(&e.to_string())))?;
        }

        // Create the worktree at the specified path
        let branch_name = format!("attempt-{}", attempt_id);
        repo.worktree(&branch_name, &worktree_path, None)?;

        // Insert the record into the database
        Ok(sqlx::query_as!(
            TaskAttempt,
            r#"INSERT INTO task_attempts (id, task_id, worktree_path, merge_commit, executor) 
               VALUES ($1, $2, $3, $4, $5) 
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, merge_commit, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            attempt_id,
            task_id,
            worktree_path_str,
            Option::<String>::None, // merge_commit is always None during creation
            data.executor
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

    /// Perform the actual git merge operations (synchronous)
    fn perform_merge_operation(
        worktree_path: &str,
        main_repo_path: &str,
        attempt_id: Uuid,
        task_title: &str,
    ) -> Result<String, TaskAttemptError> {
        // Open the worktree repository
        let worktree_repo = Repository::open(worktree_path)?;

        // Open the main repository
        let main_repo = Repository::open(main_repo_path)?;

        // Get the current signature for commits
        let signature = main_repo.signature()?;

        // Get the current HEAD commit in the worktree (changes should already be committed by execution monitor)
        let head = worktree_repo.head()?;
        let parent_commit = head.peel_to_commit()?;
        let final_commit = parent_commit.id();

        // Now we need to merge the worktree branch into the main repository
        let branch_name = format!("attempt-{}", attempt_id);

        // Get the current base branch name (e.g., "main", "master", "develop", etc.)
        let main_branch = main_repo.head()?.shorthand().unwrap_or("main").to_string();

        // Fetch the worktree branch into the main repository
        let worktree_branch_ref = format!("refs/heads/{}", branch_name);
        let main_branch_ref = format!("refs/heads/{}", main_branch);

        // Create the branch in main repo pointing to the final commit
        let branch_oid = main_repo.odb()?.write(
            git2::ObjectType::Commit,
            worktree_repo.odb()?.read(final_commit)?.data(),
        )?;

        // Create reference in main repo
        main_repo.reference(
            &worktree_branch_ref,
            branch_oid,
            true,
            "Import worktree changes",
        )?;

        // Now merge the branch into the base branch
        let main_branch_commit = main_repo
            .reference_to_annotated_commit(&main_repo.find_reference(&main_branch_ref)?)?;
        let worktree_branch_commit = main_repo
            .reference_to_annotated_commit(&main_repo.find_reference(&worktree_branch_ref)?)?;

        // Perform the merge
        let mut merge_opts = git2::MergeOptions::new();
        merge_opts.file_favor(git2::FileFavor::Theirs); // Prefer worktree changes in conflicts

        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.conflict_style_merge(true);

        main_repo.merge(
            &[&worktree_branch_commit],
            Some(&mut merge_opts),
            Some(&mut checkout_opts),
        )?;

        // Check if merge was successful (no conflicts)
        let merge_head_path = main_repo.path().join("MERGE_HEAD");
        if merge_head_path.exists() {
            // Complete the merge by creating a merge commit
            let mut index = main_repo.index()?;
            let tree_id = index.write_tree()?;
            let tree = main_repo.find_tree(tree_id)?;

            let main_commit = main_repo.find_commit(main_branch_commit.id())?;
            let worktree_commit = main_repo.find_commit(worktree_branch_commit.id())?;

            let merge_commit_message = format!("Merge task: {} into {}", task_title, main_branch);
            let merge_commit_id = main_repo.commit(
                Some(&main_branch_ref),
                &signature,
                &signature,
                &merge_commit_message,
                &tree,
                &[&main_commit, &worktree_commit],
            )?;

            // Clean up merge state
            main_repo.cleanup_state()?;

            Ok(merge_commit_id.to_string())
        } else {
            // Fast-forward merge completed
            let head_commit = main_repo.head()?.peel_to_commit()?;
            let merge_commit_id = head_commit.id();

            Ok(merge_commit_id.to_string())
        }
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
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.merge_commit, ta.executor, ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta 
               JOIN tasks t ON ta.task_id = t.id 
               WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
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

        // Perform the git merge operations (synchronous)
        let merge_commit_id = Self::perform_merge_operation(
            &attempt.worktree_path,
            &project.git_repo_path,
            attempt_id,
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
        let task_attempt = TaskAttempt::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

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

        Self::start_process_execution(
            pool,
            app_state,
            attempt_id,
            task_id,
            crate::executor::ExecutorType::DevServer(dev_script),
            "Starting dev server".to_string(),
            TaskAttemptStatus::ExecutorRunning, // Dev servers don't create activities, just use generic status
            crate::models::execution_process::ExecutionProcessType::DevServer,
            &task_attempt.worktree_path,
        )
        .await
    }

    /// Start a follow-up execution using the same executor type as the first process
    pub async fn start_followup_execution(
        pool: &SqlitePool,
        app_state: &crate::app_state::AppState,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
        prompt: &str,
    ) -> Result<(), TaskAttemptError> {
        use crate::models::{
            executor_session::ExecutorSession,
            task::{Task, TaskStatus},
        };

        // Update task status to indicate follow-up execution has started
        Task::update_status(pool, task_id, project_id, TaskStatus::InProgress).await?;

        // Get task attempt
        let task_attempt = TaskAttempt::find_by_id(pool, attempt_id)
            .await?
            .ok_or(TaskAttemptError::TaskNotFound)?;

        // Find the most recent coding agent execution process to get the executor type
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
            .ok_or(TaskAttemptError::TaskNotFound)?; // No previous coding agent found

        // Get the executor session to find the session ID
        let executor_session =
            ExecutorSession::find_by_execution_process_id(pool, most_recent_coding_agent.id)
                .await?
                .ok_or(TaskAttemptError::TaskNotFound)?; // No session found

        // Determine the executor config from the stored executor_type
        let executor_config = match most_recent_coding_agent.executor_type.as_deref() {
            Some("claude") => crate::executor::ExecutorConfig::Claude,
            Some("amp") => crate::executor::ExecutorConfig::Amp,
            Some("gemini") => crate::executor::ExecutorConfig::Gemini,
            Some("echo") => crate::executor::ExecutorConfig::Echo,
            _ => return Err(TaskAttemptError::TaskNotFound), // Invalid executor type
        };

        // Create the follow-up executor type
        let followup_executor = crate::executor::ExecutorType::FollowUpCodingAgent {
            config: executor_config,
            session_id: executor_session.session_id.clone(),
            prompt: prompt.to_string(),
        };

        Self::start_process_execution(
            pool,
            app_state,
            attempt_id,
            task_id,
            followup_executor,
            "Starting follow-up executor".to_string(),
            TaskAttemptStatus::ExecutorRunning,
            crate::models::execution_process::ExecutionProcessType::CodingAgent,
            &task_attempt.worktree_path,
        )
        .await
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
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.merge_commit, ta.executor, ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta 
               JOIN tasks t ON ta.task_id = t.id 
               WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
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

        let mut files = Vec::new();

        if let Some(merge_commit_id) = &attempt.merge_commit {
            // Task attempt has been merged - show the diff from the merge commit
            let main_repo = Repository::open(&project.git_repo_path)?;
            let merge_commit = main_repo.find_commit(git2::Oid::from_str(merge_commit_id)?)?;

            // A merge commit has multiple parents - first parent is the main branch before merge,
            // second parent is the branch that was merged
            let parents: Vec<_> = merge_commit.parents().collect();

            // Create diff options with more context
            let mut diff_opts = git2::DiffOptions::new();
            diff_opts.context_lines(10); // Include 10 lines of context around changes
            diff_opts.interhunk_lines(0); // Don't merge hunks

            let diff = if parents.len() >= 2 {
                let base_tree = parents[0].tree()?; // Main branch before merge
                let merged_tree = parents[1].tree()?; // The branch that was merged
                main_repo.diff_tree_to_tree(
                    Some(&base_tree),
                    Some(&merged_tree),
                    Some(&mut diff_opts),
                )?
            } else {
                // Fast-forward merge or single parent - compare merge commit with its parent
                let base_tree = if !parents.is_empty() {
                    parents[0].tree()?
                } else {
                    // No parents (shouldn't happen), use empty tree
                    main_repo.find_tree(git2::Oid::zero())?
                };
                let merged_tree = merge_commit.tree()?;
                main_repo.diff_tree_to_tree(
                    Some(&base_tree),
                    Some(&merged_tree),
                    Some(&mut diff_opts),
                )?
            };

            // Process each diff delta (file change)
            diff.foreach(
                &mut |delta, _progress| {
                    if let Some(path_str) = delta.new_file().path().and_then(|p| p.to_str()) {
                        let old_file = delta.old_file();
                        let new_file = delta.new_file();

                        // Get old content
                        let old_content = if !old_file.id().is_zero() {
                            match main_repo.find_blob(old_file.id()) {
                                Ok(blob) => String::from_utf8_lossy(blob.content()).to_string(),
                                Err(_) => String::new(),
                            }
                        } else {
                            String::new() // File didn't exist in base commit
                        };

                        // Get new content
                        let new_content = if !new_file.id().is_zero() {
                            match main_repo.find_blob(new_file.id()) {
                                Ok(blob) => String::from_utf8_lossy(blob.content()).to_string(),
                                Err(_) => String::new(),
                            }
                        } else {
                            String::new() // File was deleted
                        };

                        // Generate Git-native diff chunks
                        if old_content != new_content {
                            match Self::generate_git_diff_chunks(
                                &main_repo, &old_file, &new_file, path_str,
                            ) {
                                Ok(diff_chunks) if !diff_chunks.is_empty() => {
                                    files.push(FileDiff {
                                        path: path_str.to_string(),
                                        chunks: diff_chunks,
                                    });
                                }
                                Err(e) => {
                                    eprintln!("Error generating diff for {}: {:?}", path_str, e);
                                }
                                _ => {}
                            }
                        }
                    }
                    true // Continue processing
                },
                None,
                None,
                None,
            )?;
        } else {
            // Task attempt not yet merged - use the original logic with fork point
            let worktree_repo = Repository::open(&attempt.worktree_path)?;
            let main_repo = Repository::open(&project.git_repo_path)?;
            let main_head_oid = main_repo.head()?.peel_to_commit()?.id();

            // Get the current worktree HEAD commit
            let worktree_head = worktree_repo.head()?;
            let worktree_head_oid = worktree_head.peel_to_commit()?.id();

            // Find the merge base (common ancestor) between main and the worktree branch
            // This represents the point where the worktree branch forked off from main
            let base_oid = worktree_repo.merge_base(main_head_oid, worktree_head_oid)?;
            let base_commit = worktree_repo.find_commit(base_oid)?;
            let base_tree = base_commit.tree()?;

            // Get the current tree from the worktree HEAD commit we already retrieved
            let current_commit = worktree_repo.find_commit(worktree_head_oid)?;
            let current_tree = current_commit.tree()?;

            // Create a diff between the base tree and current tree with more context
            let mut diff_opts = git2::DiffOptions::new();
            diff_opts.context_lines(10); // Include 10 lines of context around changes
            diff_opts.interhunk_lines(0); // Don't merge hunks

            let diff = worktree_repo.diff_tree_to_tree(
                Some(&base_tree),
                Some(&current_tree),
                Some(&mut diff_opts),
            )?;

            // Process each diff delta (file change)
            diff.foreach(
                &mut |delta, _progress| {
                    if let Some(path_str) = delta.new_file().path().and_then(|p| p.to_str()) {
                        let old_file = delta.old_file();
                        let new_file = delta.new_file();

                        // Get old content
                        let old_content = if !old_file.id().is_zero() {
                            match worktree_repo.find_blob(old_file.id()) {
                                Ok(blob) => String::from_utf8_lossy(blob.content()).to_string(),
                                Err(_) => String::new(),
                            }
                        } else {
                            String::new() // File didn't exist in base commit
                        };

                        // Get new content
                        let new_content = if !new_file.id().is_zero() {
                            match worktree_repo.find_blob(new_file.id()) {
                                Ok(blob) => String::from_utf8_lossy(blob.content()).to_string(),
                                Err(_) => String::new(),
                            }
                        } else {
                            String::new() // File was deleted
                        };

                        // Generate Git-native diff chunks
                        if old_content != new_content {
                            match Self::generate_git_diff_chunks(
                                &worktree_repo,
                                &old_file,
                                &new_file,
                                path_str,
                            ) {
                                Ok(diff_chunks) if !diff_chunks.is_empty() => {
                                    files.push(FileDiff {
                                        path: path_str.to_string(),
                                        chunks: diff_chunks,
                                    });
                                }
                                Err(e) => {
                                    eprintln!("Error generating diff for {}: {:?}", path_str, e);
                                }
                                _ => {}
                            }
                        }
                    }
                    true // Continue processing
                },
                None,
                None,
                None,
            )?;
        }

        Ok(WorktreeDiff { files })
    }

    /// Generate diff chunks using Git's native diff algorithm
    pub fn generate_git_diff_chunks(
        repo: &Repository,
        old_file: &git2::DiffFile,
        new_file: &git2::DiffFile,
        file_path: &str,
    ) -> Result<Vec<DiffChunk>, TaskAttemptError> {
        use std::path::Path;
        let mut chunks = Vec::new();

        // Create a patch for the single file using Git's native diff
        let old_blob = if !old_file.id().is_zero() {
            Some(repo.find_blob(old_file.id())?)
        } else {
            None
        };

        let new_blob = if !new_file.id().is_zero() {
            Some(repo.find_blob(new_file.id())?)
        } else {
            None
        };

        // Generate patch using Git's diff algorithm with context
        let mut diff_opts = git2::DiffOptions::new();
        diff_opts.context_lines(10); // Include 10 lines of context around changes
        diff_opts.interhunk_lines(0); // Don't merge hunks

        let patch = match (old_blob.as_ref(), new_blob.as_ref()) {
            (Some(old_b), Some(new_b)) => git2::Patch::from_blobs(
                old_b,
                Some(Path::new(file_path)),
                new_b,
                Some(Path::new(file_path)),
                Some(&mut diff_opts),
            )?,
            (None, Some(new_b)) => {
                // File was added - diff from empty buffer to new blob content
                git2::Patch::from_buffers(
                    &[], // empty buffer represents the "old" version (file didn't exist)
                    Some(Path::new(file_path)),
                    new_b.content(), // new blob content as buffer
                    Some(Path::new(file_path)),
                    Some(&mut diff_opts),
                )?
            }
            (Some(old_b), None) => {
                // File was deleted - diff from old blob to empty buffer
                git2::Patch::from_blob_and_buffer(
                    old_b,
                    Some(Path::new(file_path)),
                    &[],
                    Some(Path::new(file_path)),
                    Some(&mut diff_opts),
                )?
            }
            (None, None) => {
                // No change, shouldn't happen
                return Ok(chunks);
            }
        };

        // Process the patch hunks
        for hunk_idx in 0..patch.num_hunks() {
            let (_hunk, hunk_lines) = patch.hunk(hunk_idx)?;

            // Process each line in the hunk
            for line_idx in 0..hunk_lines {
                let line = patch.line_in_hunk(hunk_idx, line_idx)?;
                let content = String::from_utf8_lossy(line.content()).to_string();

                let chunk_type = match line.origin() {
                    ' ' => DiffChunkType::Equal,
                    '+' => DiffChunkType::Insert,
                    '-' => DiffChunkType::Delete,
                    _ => continue, // Skip other line types (like context headers)
                };

                chunks.push(DiffChunk {
                    chunk_type,
                    content,
                });
            }
        }

        Ok(chunks)
    }

    /// Get the branch status for this task attempt (ahead/behind main)
    pub async fn get_branch_status(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<BranchStatus, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.merge_commit, ta.executor, ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta 
               JOIN tasks t ON ta.task_id = t.id 
               WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
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

        // Open the main repository
        let main_repo = Repository::open(&project.git_repo_path)?;

        // Open the worktree repository
        let worktree_repo = Repository::open(&attempt.worktree_path)?;

        // Get the base branch name from the main repository
        let base_branch_name = main_repo.head()?.shorthand().unwrap_or("main").to_string();

        // Get the current HEAD of base branch in the main repo
        let main_head = main_repo.head()?.peel_to_commit()?;
        let main_oid = main_head.id();

        // Get the current HEAD of the worktree
        let worktree_head = worktree_repo.head()?.peel_to_commit()?;
        let worktree_oid = worktree_head.id();

        // Check for uncommitted changes in the worktree
        let has_uncommitted_changes = {
            let statuses = worktree_repo.statuses(None)?;
            statuses.iter().any(|entry| {
                let status = entry.status();
                // Check for any unstaged or staged changes
                status.is_wt_modified()
                    || status.is_wt_new()
                    || status.is_wt_deleted()
                    || status.is_index_modified()
                    || status.is_index_new()
                    || status.is_index_deleted()
            })
        };

        if main_oid == worktree_oid {
            // Branches are at the same commit
            return Ok(BranchStatus {
                is_behind: false,
                commits_behind: 0,
                commits_ahead: 0,
                up_to_date: true,
                merged: attempt.merge_commit.is_some(),
                has_uncommitted_changes,
                base_branch_name,
            });
        }

        // Count commits ahead/behind
        let mut revwalk = main_repo.revwalk()?;

        // Count commits behind (main has commits that worktree doesn't)
        revwalk.push(main_oid)?;
        revwalk.hide(worktree_oid)?;
        let commits_behind = revwalk.count();

        // Count commits ahead (worktree has commits that main doesn't)
        let mut revwalk = main_repo.revwalk()?;
        revwalk.push(worktree_oid)?;
        revwalk.hide(main_oid)?;
        let commits_ahead = revwalk.count();

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

    /// Perform the actual git rebase operations (synchronous)
    fn perform_rebase_operation(
        worktree_path: &str,
        main_repo_path: &str,
    ) -> Result<String, TaskAttemptError> {
        let main_repo = Repository::open(main_repo_path)?;
        let repo = Repository::open(worktree_path)?;

        // 1️⃣ get main HEAD oid
        let main_oid = main_repo.head()?.peel_to_commit()?.id();

        // 2️⃣ early exit if up-to-date
        let orig_oid = repo.head()?.peel_to_commit()?.id();
        if orig_oid == main_oid {
            return Ok(orig_oid.to_string());
        }

        // 3️⃣ prepare upstream
        let main_annot = repo.find_annotated_commit(main_oid)?;

        // 4️⃣ set up in-memory rebase
        let mut opts = RebaseOptions::new();
        opts.inmemory(true).merge_options(MergeOptions::new());

        // 5️⃣ start rebase of HEAD onto main
        let mut reb = repo.rebase(None, Some(&main_annot), None, Some(&mut opts))?;

        // 6️⃣ replay commits, remember last OID
        let sig = repo.signature()?;
        let mut last_oid: Option<Oid> = None;
        while let Some(res) = reb.next() {
            match res {
                Ok(_op) => {
                    let new_oid = reb.commit(None, &sig, None)?;
                    last_oid = Some(new_oid);
                }
                Err(e) => {
                    error!("rebase op failed: {}", e);
                    reb.abort()?;
                    return Err(TaskAttemptError::Git(e));
                }
            }
        }

        // 7️⃣ finish (still in-memory)
        reb.finish(Some(&sig))?;

        // 8️⃣ repoint your branch ref (HEAD is a symbolic to this ref)
        if let Some(target) = last_oid {
            let head_ref = repo.head()?; // symbolic HEAD
            let branch_name = head_ref.name().unwrap(); // e.g. "refs/heads/feature"
            let mut r = repo.find_reference(branch_name)?;
            r.set_target(target, "rebase: update branch")?;
        }

        // 9️⃣ update working tree
        repo.checkout_head(Some(CheckoutBuilder::new().force()))?;

        Ok(main_oid.to_string())
    }

    /// Rebase the worktree branch onto main
    pub async fn rebase_onto_main(
        pool: &SqlitePool,
        attempt_id: Uuid,
        task_id: Uuid,
        project_id: Uuid,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.merge_commit, ta.executor, ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta 
               JOIN tasks t ON ta.task_id = t.id 
               WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
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

        // Perform the git rebase operations (synchronous)
        let new_base_commit =
            Self::perform_rebase_operation(&attempt.worktree_path, &project.git_repo_path)?;

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
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.merge_commit, ta.executor, ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta 
               JOIN tasks t ON ta.task_id = t.id 
               WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
            attempt_id,
            task_id,
            project_id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskAttemptError::TaskNotFound)?;

        // Open the worktree repository
        let repo = Repository::open(&attempt.worktree_path)?;

        // Get the absolute path to the file within the worktree
        let worktree_path = Path::new(&attempt.worktree_path);
        let file_full_path = worktree_path.join(file_path);

        // Check if file exists and delete it
        if file_full_path.exists() {
            std::fs::remove_file(&file_full_path).map_err(|e| {
                TaskAttemptError::Git(GitError::from_str(&format!(
                    "Failed to delete file {}: {}",
                    file_path, e
                )))
            })?;

            debug!("Deleted file: {}", file_path);
        } else {
            info!("File {} does not exist, skipping deletion", file_path);
        }

        // Stage the deletion
        let mut index = repo.index()?;
        index.remove_path(Path::new(file_path))?;
        index.write()?;

        // Create a commit for the file deletion
        let signature = repo.signature()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        // Get the current HEAD commit
        let head = repo.head()?;
        let parent_commit = head.peel_to_commit()?;

        let commit_message = format!("Delete file: {}", file_path);
        let commit_id = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &commit_message,
            &tree,
            &[&parent_commit],
        )?;

        info!("File {} deleted and committed: {}", file_path, commit_id);

        Ok(commit_id.to_string())
    }
}
