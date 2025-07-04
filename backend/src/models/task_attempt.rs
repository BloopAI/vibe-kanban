use std::path::Path;

use chrono::{DateTime, Utc};
use git2::{BranchType, Error as GitError, RebaseOptions, Repository, WorktreeAddOptions};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use tracing::{debug, info};
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
    BranchNotFound(String),
}

impl std::fmt::Display for TaskAttemptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskAttemptError::Database(e) => write!(f, "Database error: {}", e),
            TaskAttemptError::Git(e) => write!(f, "Git error: {}", e),
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
    pub branch: String, // Git branch name for this task attempt
    pub merge_commit: Option<String>,
    pub executor: Option<String>,  // Name of the executor to use
    pub pr_url: Option<String>,    // GitHub PR URL
    pub pr_number: Option<i64>,    // GitHub PR number
    pub pr_status: Option<String>, // open, closed, merged
    pub pr_merged_at: Option<DateTime<Utc>>, // When PR was merged
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
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttempt,
            r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at as "pr_merged_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
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
            r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at as "pr_merged_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
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

        // Generate worktree path automatically using cross-platform temporary directory
        let temp_dir = std::env::temp_dir();
        let worktree_path = temp_dir.join(&task_attempt_branch);
        let worktree_path_str = worktree_path.to_string_lossy().to_string();

        // Then get the project using the project_id
        let project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(TaskAttemptError::ProjectNotFound)?;

        // Solve scoping issues
        {
            // Create the worktree using git2
            let repo = Repository::open(&project.git_repo_path)?;

            // Choose base reference, based on whether user specified base branch
            let base_reference = if let Some(base_branch) = data.base_branch.clone() {
                let branch = repo.find_branch(base_branch.as_str(), BranchType::Local)?;
                branch.into_reference()
            } else {
                // Handle new repositories without any commits
                match repo.head() {
                    Ok(head_ref) => head_ref,
                    Err(e)
                        if e.class() == git2::ErrorClass::Reference
                            && e.code() == git2::ErrorCode::UnbornBranch =>
                    {
                        // Repository has no commits yet, create an initial commit
                        let signature = repo.signature().unwrap_or_else(|_| {
                            // Fallback if no Git config is set
                            git2::Signature::now("Vibe Kanban", "noreply@vibekanban.com")
                                .expect("Failed to create fallback signature")
                        });
                        let tree_id = {
                            let tree_builder = repo.treebuilder(None)?;
                            tree_builder.write()?
                        };
                        let tree = repo.find_tree(tree_id)?;

                        // Create initial commit on main branch
                        let _commit_id = repo.commit(
                            Some("refs/heads/main"),
                            &signature,
                            &signature,
                            "Initial commit",
                            &tree,
                            &[],
                        )?;

                        // Set HEAD to point to main branch
                        repo.set_head("refs/heads/main")?;

                        // Return reference to main branch
                        repo.find_reference("refs/heads/main")?
                    }
                    Err(e) => return Err(e.into()),
                }
            };

            // Create branch
            repo.branch(
                &task_attempt_branch,
                &base_reference.peel_to_commit()?,
                false,
            )?;

            let branch = repo.find_branch(&task_attempt_branch, BranchType::Local)?;
            let branch_ref = branch.into_reference();
            let mut worktree_opts = WorktreeAddOptions::new();
            worktree_opts.reference(Some(&branch_ref));

            // Create the worktree directory if it doesn't exist
            if let Some(parent) = worktree_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| TaskAttemptError::Git(GitError::from_str(&e.to_string())))?;
            }

            // Create the worktree at the specified path
            repo.worktree(&task_attempt_branch, &worktree_path, Some(&worktree_opts))?;
        }

        // Insert the record into the database
        Ok(sqlx::query_as!(
            TaskAttempt,
            r#"INSERT INTO task_attempts (id, task_id, worktree_path, branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
               RETURNING id as "id!: Uuid", task_id as "task_id!: Uuid", worktree_path, branch, merge_commit, executor, pr_url, pr_number, pr_status, pr_merged_at as "pr_merged_at: DateTime<Utc>", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            attempt_id,
            task_id,
            worktree_path_str,
            task_attempt_branch,
            Option::<String>::None, // merge_commit is always None during creation
            data.executor,
            Option::<String>::None, // pr_url is None during creation
            Option::<i64>::None, // pr_number is None during creation
            Option::<String>::None, // pr_status is None during creation
            Option::<DateTime<Utc>>::None // pr_merged_at is None during creation
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

    /// Perform the actual merge operation (synchronous)
    fn perform_merge_operation(
        worktree_path: &str,
        main_repo_path: &str,
        branch_name: &str,
        task_title: &str,
    ) -> Result<String, TaskAttemptError> {
        // Open the main repository
        let main_repo = Repository::open(main_repo_path)?;

        // Open the worktree repository to get the latest commit
        let worktree_repo = Repository::open(worktree_path)?;
        let worktree_head = worktree_repo.head()?;
        let worktree_commit = worktree_head.peel_to_commit()?;

        // Verify the branch exists in the main repo
        main_repo
            .find_branch(branch_name, BranchType::Local)
            .map_err(|_| TaskAttemptError::BranchNotFound(branch_name.to_string()))?;

        // Get the current HEAD of the main repo (usually main/master)
        let main_head = main_repo.head()?;
        let main_commit = main_head.peel_to_commit()?;

        // Get the signature for the merge commit
        let signature = main_repo.signature()?;

        // Get the tree from the worktree commit and find it in the main repo
        let worktree_tree_id = worktree_commit.tree_id();
        let main_tree = main_repo.find_tree(worktree_tree_id)?;

        // Find the worktree commit in the main repo
        let main_worktree_commit = main_repo.find_commit(worktree_commit.id())?;

        // Create a merge commit
        let merge_commit_id = main_repo.commit(
            Some("HEAD"),                                    // Update HEAD
            &signature,                                      // Author
            &signature,                                      // Committer
            &format!("Merge: {} (vibe-kanban)", task_title), // Message using task title
            &main_tree,                                      // Use the tree from main repo
            &[&main_commit, &main_worktree_commit], // Parents: main HEAD and worktree commit
        )?;

        info!("Created merge commit: {}", merge_commit_id);

        Ok(merge_commit_id.to_string())
    }

    /// Perform the actual git rebase operations (synchronous)
    fn perform_rebase_operation(
        worktree_path: &str,
        main_repo_path: &str,
        new_base_branch: Option<String>,
    ) -> Result<String, TaskAttemptError> {
        // Open the worktree repository
        let worktree_repo = Repository::open(worktree_path)?;

        // Open the main repository to get the target base commit
        let main_repo = Repository::open(main_repo_path)?;

        // Get the target base branch reference
        let base_branch_name = new_base_branch.unwrap_or_else(|| {
            main_repo
                .head()
                .ok()
                .and_then(|head| head.shorthand().map(|s| s.to_string()))
                .unwrap_or_else(|| "main".to_string())
        });

        // Check if the specified base branch exists in the main repo
        let base_branch = main_repo
            .find_branch(&base_branch_name, BranchType::Local)
            .map_err(|_| TaskAttemptError::BranchNotFound(base_branch_name.clone()))?;

        let base_commit_id = base_branch.get().peel_to_commit()?.id();

        // Get the HEAD commit of the worktree (the changes to rebase)
        let head = worktree_repo.head()?;

        // Set up rebase
        let mut rebase_opts = RebaseOptions::new();
        let signature = worktree_repo.signature()?;

        // Start the rebase
        let head_annotated = worktree_repo.reference_to_annotated_commit(&head)?;
        let base_annotated = worktree_repo.find_annotated_commit(base_commit_id)?;

        let mut rebase = worktree_repo.rebase(
            Some(&head_annotated),
            Some(&base_annotated),
            None, // onto (use upstream if None)
            Some(&mut rebase_opts),
        )?;

        // Process each rebase operation
        while let Some(operation) = rebase.next() {
            let _operation = operation?;

            // Check for conflicts
            let index = worktree_repo.index()?;
            if index.has_conflicts() {
                // For now, abort the rebase on conflicts
                rebase.abort()?;
                return Err(TaskAttemptError::Git(GitError::from_str(
                    "Rebase failed due to conflicts. Please resolve conflicts manually.",
                )));
            }

            // Commit the rebased operation
            rebase.commit(None, &signature, None)?;
        }

        // Finish the rebase
        rebase.finish(None)?;

        // Get the final commit ID after rebase
        let final_head = worktree_repo.head()?;
        let final_commit = final_head.peel_to_commit()?;

        info!("Rebase completed. New HEAD: {}", final_commit.id());

        Ok(final_commit.id().to_string())
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
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.branch, ta.merge_commit, ta.executor, ta.pr_url, ta.pr_number, ta.pr_status, ta.pr_merged_at as "pr_merged_at: DateTime<Utc>", ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
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

        // Perform the actual merge operation
        let merge_commit_id = Self::perform_merge_operation(
            &attempt.worktree_path,
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

        let result = Self::start_process_execution(
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
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.branch, ta.merge_commit, ta.executor, ta.pr_url, ta.pr_number, ta.pr_status, ta.pr_merged_at as "pr_merged_at: DateTime<Utc>", ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
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

            // Now also get unstaged changes (working directory changes)
            let current_tree = worktree_repo.head()?.peel_to_tree()?;

            // Create diff from HEAD to working directory for unstaged changes
            let mut unstaged_diff_opts = git2::DiffOptions::new();
            unstaged_diff_opts.context_lines(10);
            unstaged_diff_opts.interhunk_lines(0);
            unstaged_diff_opts.include_untracked(true); // Include untracked files

            let unstaged_diff = worktree_repo.diff_tree_to_workdir_with_index(
                Some(&current_tree),
                Some(&mut unstaged_diff_opts),
            )?;

            // Process unstaged changes
            unstaged_diff.foreach(
                &mut |delta, _progress| {
                    if let Some(path_str) = delta.new_file().path().and_then(|p| p.to_str()) {
                        if let Err(e) = Self::process_unstaged_file(
                            &mut files,
                            &worktree_repo,
                            base_oid,
                            &attempt.worktree_path,
                            path_str,
                            &delta,
                        ) {
                            eprintln!("Error processing unstaged file {}: {:?}", path_str, e);
                        }
                    }
                    true
                },
                None,
                None,
                None,
            )?;
        }

        Ok(WorktreeDiff { files })
    }

    fn process_unstaged_file(
        files: &mut Vec<FileDiff>,
        worktree_repo: &Repository,
        base_oid: git2::Oid,
        worktree_path: &str,
        path_str: &str,
        delta: &git2::DiffDelta,
    ) -> Result<(), TaskAttemptError> {
        let old_file = delta.old_file();
        let new_file = delta.new_file();

        // Check if we already have a diff for this file from committed changes
        if let Some(existing_file) = files.iter_mut().find(|f| f.path == path_str) {
            // File already has committed changes, need to create a combined diff
            // from the base branch to the current working directory (including unstaged changes)

            // Get the base content (from the fork point)
            let base_content = if let Ok(base_commit) = worktree_repo.find_commit(base_oid) {
                if let Ok(base_tree) = base_commit.tree() {
                    match base_tree.get_path(std::path::Path::new(path_str)) {
                        Ok(entry) => {
                            if let Ok(blob) = worktree_repo.find_blob(entry.id()) {
                                String::from_utf8_lossy(blob.content()).to_string()
                            } else {
                                String::new()
                            }
                        }
                        Err(_) => String::new(),
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            // Get the working directory content
            let working_content = if delta.status() != git2::Delta::Deleted {
                let file_path = std::path::Path::new(worktree_path).join(path_str);
                std::fs::read_to_string(&file_path).unwrap_or_default()
            } else {
                String::new()
            };

            // Create a combined diff from base to working directory
            if base_content != working_content {
                // Use git's patch generation with the content directly
                let mut diff_opts = git2::DiffOptions::new();
                diff_opts.context_lines(10);
                diff_opts.interhunk_lines(0);

                if let Ok(patch) = git2::Patch::from_buffers(
                    base_content.as_bytes(),
                    Some(std::path::Path::new(path_str)),
                    working_content.as_bytes(),
                    Some(std::path::Path::new(path_str)),
                    Some(&mut diff_opts),
                ) {
                    let mut combined_chunks = Vec::new();

                    // Process the patch hunks
                    for hunk_idx in 0..patch.num_hunks() {
                        if let Ok((_hunk, hunk_lines)) = patch.hunk(hunk_idx) {
                            // Process each line in the hunk
                            for line_idx in 0..hunk_lines {
                                if let Ok(line) = patch.line_in_hunk(hunk_idx, line_idx) {
                                    let content =
                                        String::from_utf8_lossy(line.content()).to_string();

                                    let chunk_type = match line.origin() {
                                        ' ' => DiffChunkType::Equal,
                                        '+' => DiffChunkType::Insert,
                                        '-' => DiffChunkType::Delete,
                                        _ => continue, // Skip other line types
                                    };

                                    combined_chunks.push(DiffChunk {
                                        chunk_type,
                                        content,
                                    });
                                }
                            }
                        }
                    }

                    if !combined_chunks.is_empty() {
                        existing_file.chunks = combined_chunks;
                    }
                }
            }
        } else {
            // File only has unstaged changes (new file or uncommitted changes only)
            match Self::generate_git_diff_chunks(worktree_repo, &old_file, &new_file, path_str) {
                Ok(diff_chunks) if !diff_chunks.is_empty() => {
                    files.push(FileDiff {
                        path: path_str.to_string(),
                        chunks: diff_chunks,
                    });
                }
                Err(e) => {
                    eprintln!("Error generating unstaged diff for {}: {:?}", path_str, e);
                }
                _ => {}
            }
        }

        Ok(())
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
                    ta.merge_commit,
                    ta.executor,
                    ta.pr_url,
                    ta.pr_number,
                    ta.pr_status,
                    ta.pr_merged_at      AS "pr_merged_at: DateTime<Utc>",
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

        use git2::{BranchType, Repository, Status, StatusOptions};

        let main_repo = Repository::open(&project.git_repo_path)?;
        let attempt_branch = attempt.branch.clone();

        // ── locate the commit pointed to by the attempt branch ───────────────────────
        let attempt_ref = main_repo
            // try "refs/heads/<name>" first, then raw name
            .find_reference(&format!("refs/heads/{}", attempt_branch))
            .or_else(|_| main_repo.find_reference(&attempt_branch))?;
        let attempt_oid = attempt_ref.target().unwrap();

        // ── determine the base branch & ahead/behind counts ─────────────────────────
        let mut base_branch_name = String::from("main"); // sensible default
        let mut commits_ahead: usize = 0;
        let mut commits_behind: usize = 0;
        let mut best_distance: usize = usize::MAX;

        // 1. prefer the branch’s configured upstream, if any
        if let Ok(local_branch) = main_repo.find_branch(&attempt_branch, BranchType::Local) {
            if let Ok(upstream) = local_branch.upstream() {
                if let Some(name) = upstream.name()? {
                    if let Some(base_oid) = upstream.get().target() {
                        let (ahead, behind) =
                            main_repo.graph_ahead_behind(attempt_oid, base_oid)?;
                        base_branch_name = name.to_owned();
                        commits_ahead = ahead;
                        commits_behind = behind;
                        best_distance = ahead + behind;
                    }
                }
            }
        }

        // 2. otherwise, take the branch with the smallest ahead+behind distance
        if best_distance == usize::MAX {
            for br in main_repo.branches(None)? {
                let (br, _) = br?;
                let name = br.name()?.unwrap_or_default();
                if name == attempt_branch {
                    continue; // skip comparing the branch to itself
                }
                if let Some(base_oid) = br.get().target() {
                    let (ahead, behind) = main_repo.graph_ahead_behind(attempt_oid, base_oid)?;
                    let distance = ahead + behind;
                    if distance < best_distance {
                        best_distance = distance;
                        base_branch_name = name.to_owned();
                        commits_ahead = ahead;
                        commits_behind = behind;
                    }
                }
            }
        }

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
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.branch, ta.merge_commit, ta.executor, ta.pr_url, ta.pr_number, ta.pr_status, ta.pr_merged_at as "pr_merged_at: DateTime<Utc>", ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
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
        let new_base_commit = Self::perform_rebase_operation(
            &attempt.worktree_path,
            &project.git_repo_path,
            new_base_branch,
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
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.branch, ta.merge_commit, ta.executor, ta.pr_url, ta.pr_number, ta.pr_status, ta.pr_merged_at as "pr_merged_at: DateTime<Utc>", ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
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

    /// Create a GitHub PR for this task attempt
    pub async fn create_github_pr(
        pool: &SqlitePool,
        params: CreatePrParams<'_>,
    ) -> Result<String, TaskAttemptError> {
        // Get the task attempt with validation
        let attempt = sqlx::query_as!(
            TaskAttempt,
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.branch, ta.merge_commit, ta.executor, ta.pr_url, ta.pr_number, ta.pr_status, ta.pr_merged_at as "pr_merged_at: DateTime<Utc>", ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
               FROM task_attempts ta 
               JOIN tasks t ON ta.task_id = t.id 
               WHERE ta.id = $1 AND t.id = $2 AND t.project_id = $3"#,
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

        // Extract GitHub repository information from the project path
        let (owner, repo_name) = Self::extract_github_repo_info(&project.git_repo_path)?;

        // Push the branch to GitHub first
        Self::push_branch_to_github(&attempt.worktree_path, &attempt.branch, params.github_token)?;

        // Create the PR using Octocrab
        let pr_url = Self::create_pr_with_octocrab(
            params.github_token,
            &owner,
            &repo_name,
            &attempt.branch,
            params.base_branch.unwrap_or("main"),
            params.title,
            params.body,
        )
        .await?;

        // Extract PR number from URL (GitHub URLs are in format: https://github.com/owner/repo/pull/123)
        let pr_number = pr_url
            .split('/')
            .next_back()
            .and_then(|n| n.parse::<i64>().ok());

        // Update the task attempt with PR information
        sqlx::query!(
            "UPDATE task_attempts SET pr_url = $1, pr_number = $2, pr_status = $3, updated_at = datetime('now') WHERE id = $4",
            pr_url,
            pr_number,
            "open",
            params.attempt_id
        )
        .execute(pool)
        .await?;

        Ok(pr_url)
    }

    /// Extract GitHub owner and repo name from git repo path
    fn extract_github_repo_info(git_repo_path: &str) -> Result<(String, String), TaskAttemptError> {
        // Try to extract from remote origin URL
        let repo = Repository::open(git_repo_path)?;
        let remote = repo.find_remote("origin").map_err(|_| {
            TaskAttemptError::ValidationError("No 'origin' remote found".to_string())
        })?;

        let url = remote.url().ok_or_else(|| {
            TaskAttemptError::ValidationError("Remote origin has no URL".to_string())
        })?;

        // Parse GitHub URL (supports both HTTPS and SSH formats)
        let github_regex = regex::Regex::new(r"github\.com[:/]([^/]+)/(.+?)(?:\.git)?/?$")
            .map_err(|e| TaskAttemptError::ValidationError(format!("Regex error: {}", e)))?;

        if let Some(captures) = github_regex.captures(url) {
            let owner = captures.get(1).unwrap().as_str().to_string();
            let repo_name = captures.get(2).unwrap().as_str().to_string();
            Ok((owner, repo_name))
        } else {
            Err(TaskAttemptError::ValidationError(format!(
                "Not a GitHub repository: {}",
                url
            )))
        }
    }

    /// Push the branch to GitHub remote
    fn push_branch_to_github(
        worktree_path: &str,
        branch_name: &str,
        github_token: &str,
    ) -> Result<(), TaskAttemptError> {
        let repo = Repository::open(worktree_path)?;

        // Get the remote
        let remote = repo.find_remote("origin")?;
        let remote_url = remote.url().ok_or_else(|| {
            TaskAttemptError::ValidationError("Remote origin has no URL".to_string())
        })?;

        // Convert SSH URL to HTTPS URL if necessary
        let https_url = if remote_url.starts_with("git@github.com:") {
            // Convert git@github.com:owner/repo.git to https://github.com/owner/repo.git
            remote_url.replace("git@github.com:", "https://github.com/")
        } else if remote_url.starts_with("ssh://git@github.com/") {
            // Convert ssh://git@github.com/owner/repo.git to https://github.com/owner/repo.git
            remote_url.replace("ssh://git@github.com/", "https://github.com/")
        } else {
            remote_url.to_string()
        };

        // Create a temporary remote with HTTPS URL for pushing
        let temp_remote_name = "temp_https_origin";

        // Remove any existing temp remote
        let _ = repo.remote_delete(temp_remote_name);

        // Create temporary HTTPS remote
        let mut temp_remote = repo.remote(temp_remote_name, &https_url)?;

        // Create refspec for pushing the branch
        let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

        // Set up authentication callback using the GitHub token
        let mut callbacks = git2::RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            git2::Cred::userpass_plaintext(username_from_url.unwrap_or("git"), github_token)
        });

        // Configure push options
        let mut push_options = git2::PushOptions::new();
        push_options.remote_callbacks(callbacks);

        // Push the branch
        let push_result = temp_remote.push(&[&refspec], Some(&mut push_options));

        // Clean up the temporary remote
        let _ = repo.remote_delete(temp_remote_name);

        // Check push result
        push_result.map_err(TaskAttemptError::Git)?;

        info!("Pushed branch {} to GitHub using HTTPS", branch_name);
        Ok(())
    }

    /// Create a PR using Octocrab
    async fn create_pr_with_octocrab(
        github_token: &str,
        owner: &str,
        repo_name: &str,
        head_branch: &str,
        base_branch: &str,
        title: &str,
        body: Option<&str>,
    ) -> Result<String, TaskAttemptError> {
        let octocrab = octocrab::OctocrabBuilder::new()
            .personal_token(github_token.to_string())
            .build()
            .map_err(|e| {
                TaskAttemptError::ValidationError(format!("Failed to create GitHub client: {}", e))
            })?;

        // Verify repository access
        octocrab.repos(owner, repo_name).get().await.map_err(|e| {
            TaskAttemptError::ValidationError(format!(
                "Cannot access repository {}/{}: {}",
                owner, repo_name, e
            ))
        })?;

        // Check if the base branch exists
        octocrab
            .repos(owner, repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(
                base_branch.to_string(),
            ))
            .await
            .map_err(|e| {
                TaskAttemptError::ValidationError(format!(
                    "Base branch '{}' does not exist: {}",
                    base_branch, e
                ))
            })?;

        // Check if the head branch exists
        octocrab.repos(owner, repo_name)
            .get_ref(&octocrab::params::repos::Reference::Branch(head_branch.to_string())).await
            .map_err(|e| TaskAttemptError::ValidationError(format!("Head branch '{}' does not exist. Make sure the branch was pushed successfully: {}", head_branch, e)))?;

        let pr = octocrab
            .pulls(owner, repo_name)
            .create(title, head_branch, base_branch)
            .body(body.unwrap_or(""))
            .send()
            .await
            .map_err(|e| match e {
                octocrab::Error::GitHub { source, .. } => {
                    TaskAttemptError::ValidationError(format!(
                        "GitHub API error: {} (status: {})",
                        source.message,
                        source.status_code.as_u16()
                    ))
                }
                _ => TaskAttemptError::ValidationError(format!("Failed to create PR: {}", e)),
            })?;

        info!(
            "Created GitHub PR #{} for branch {}",
            pr.number, head_branch
        );
        Ok(pr
            .html_url
            .map(|url| url.to_string())
            .unwrap_or_else(|| "".to_string()))
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
            r#"SELECT ta.id as "id!: Uuid", ta.task_id as "task_id!: Uuid", ta.worktree_path, ta.branch, ta.merge_commit, ta.executor, ta.pr_url, ta.pr_number, ta.pr_status, ta.pr_merged_at as "pr_merged_at: DateTime<Utc>", ta.created_at as "created_at!: DateTime<Utc>", ta.updated_at as "updated_at!: DateTime<Utc>"
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
