use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use anyhow::anyhow;
use async_stream::try_stream;
use async_trait::async_trait;
use axum::response::sse::Event;
use command_group::AsyncGroupChild;
use db::{
    DBService,
    models::{
        execution_process::{
            ExecutionContext, ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus,
        },
        executor_session::ExecutorSession,
        project::Project,
        task_attempt::TaskAttempt,
    },
};
use deployment::DeploymentError;
use executors::{
    actions::{Executable, ExecutorAction},
    logs::utils::ConversationPatch,
};
use futures::{StreamExt, TryStreamExt, stream::select};
use serde_json::json;
use services::services::{
    analytics::AnalyticsContext,
    config::Config,
    container::{ContainerError, ContainerRef, ContainerService},
    filesystem_watcher,
    git::GitService,
    notification::NotificationService,
    worktree_manager::WorktreeManager,
};
use tokio::{sync::RwLock, task::JoinHandle};
use tokio_util::io::ReaderStream;
use utils::{
    log_msg::LogMsg,
    msg_store::MsgStore,
    text::{git_branch_id, short_uuid},
};
use uuid::Uuid;

use crate::command;

#[derive(Clone)]
pub struct LocalContainerService {
    db: DBService,
    child_store: Arc<RwLock<HashMap<Uuid, Arc<RwLock<AsyncGroupChild>>>>>,
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    config: Arc<RwLock<Config>>,
    git: GitService,
    analytics: Option<AnalyticsContext>,
}

impl LocalContainerService {
    pub fn new(
        db: DBService,
        msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
        config: Arc<RwLock<Config>>,
        git: GitService,
        analytics: Option<AnalyticsContext>,
    ) -> Self {
        let child_store = Arc::new(RwLock::new(HashMap::new()));

        LocalContainerService {
            db,
            child_store,
            msg_stores,
            config,
            git,
            analytics,
        }
    }

    pub async fn get_child_from_store(&self, id: &Uuid) -> Option<Arc<RwLock<AsyncGroupChild>>> {
        let map = self.child_store.read().await;
        map.get(id).cloned()
    }

    pub async fn add_child_to_store(&self, id: Uuid, exec: AsyncGroupChild) {
        let mut map = self.child_store.write().await;
        map.insert(id, Arc::new(RwLock::new(exec)));
    }

    pub async fn remove_child_from_store(&self, id: &Uuid) {
        let mut map = self.child_store.write().await;
        map.remove(id);
    }

    /// Notifications are sent when:
    /// - A CodingAgent completes without a next_action
    /// - A CleanupScript completes
    fn should_notify(ctx: &ExecutionContext) -> bool {
        (matches!(
            ctx.execution_process.run_reason,
            ExecutionProcessRunReason::CodingAgent
        ) && ctx
            .execution_process
            .executor_action()
            .next_action
            .is_none())
            || matches!(
                ctx.execution_process.run_reason,
                ExecutionProcessRunReason::CleanupScript
            )
    }

    /// Defensively check for externally deleted worktrees and mark them as deleted in the database
    async fn check_externally_deleted_worktrees(db: &DBService) -> Result<(), DeploymentError> {
        let active_attempts = TaskAttempt::find_by_worktree_deleted(&db.pool).await?;
        tracing::debug!(
            "Checking {} active worktrees for external deletion...",
            active_attempts.len()
        );
        for (attempt_id, worktree_path) in active_attempts {
            // Check if worktree directory exists
            if !std::path::Path::new(&worktree_path).exists() {
                // Worktree was deleted externally, mark as deleted in database
                if let Err(e) = TaskAttempt::mark_worktree_deleted(&db.pool, attempt_id).await {
                    tracing::error!(
                        "Failed to mark externally deleted worktree as deleted for attempt {}: {}",
                        attempt_id,
                        e
                    );
                } else {
                    tracing::info!(
                        "Marked externally deleted worktree as deleted for attempt {} (path: {})",
                        attempt_id,
                        worktree_path
                    );
                }
            }
        }
        Ok(())
    }

    /// Find and delete orphaned worktrees that don't correspond to any task attempts
    async fn cleanup_orphaned_worktrees(&self) {
        // Check if orphan cleanup is disabled via environment variable
        if std::env::var("DISABLE_WORKTREE_ORPHAN_CLEANUP").is_ok() {
            tracing::debug!(
                "Orphan worktree cleanup is disabled via DISABLE_WORKTREE_ORPHAN_CLEANUP environment variable"
            );
            return;
        }
        let worktree_base_dir = WorktreeManager::get_worktree_base_dir();
        if !worktree_base_dir.exists() {
            tracing::debug!(
                "Worktree base directory {} does not exist, skipping orphan cleanup",
                worktree_base_dir.display()
            );
            return;
        }
        let entries = match std::fs::read_dir(&worktree_base_dir) {
            Ok(entries) => entries,
            Err(e) => {
                tracing::error!(
                    "Failed to read worktree base directory {}: {}",
                    worktree_base_dir.display(),
                    e
                );
                return;
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    tracing::warn!("Failed to read directory entry: {}", e);
                    continue;
                }
            };
            let path = entry.path();
            // Only process directories
            if !path.is_dir() {
                continue;
            }

            let worktree_path_str = path.to_string_lossy().to_string();
            if let Ok(false) =
                TaskAttempt::container_ref_exists(&self.db().pool, &worktree_path_str).await
            {
                // This is an orphaned worktree - delete it
                tracing::info!("Found orphaned worktree: {}", worktree_path_str);
                if let Err(e) = WorktreeManager::cleanup_worktree(&path, None).await {
                    tracing::error!(
                        "Failed to remove orphaned worktree {}: {}",
                        worktree_path_str,
                        e
                    );
                } else {
                    tracing::info!(
                        "Successfully removed orphaned worktree: {}",
                        worktree_path_str
                    );
                }
            }
        }
    }

    pub async fn cleanup_expired_attempt(
        db: &DBService,
        attempt_id: Uuid,
        worktree_path: PathBuf,
        git_repo_path: PathBuf,
    ) -> Result<(), DeploymentError> {
        WorktreeManager::cleanup_worktree(&worktree_path, Some(&git_repo_path)).await?;
        // Mark worktree as deleted in database after successful cleanup
        TaskAttempt::mark_worktree_deleted(&db.pool, attempt_id).await?;
        tracing::info!("Successfully marked worktree as deleted for attempt {attempt_id}",);
        Ok(())
    }

    pub async fn cleanup_expired_attempts(db: &DBService) -> Result<(), DeploymentError> {
        let expired_attempts = TaskAttempt::find_expired_for_cleanup(&db.pool).await?;
        if expired_attempts.is_empty() {
            tracing::debug!("No expired worktrees found");
            return Ok(());
        }
        tracing::info!(
            "Found {} expired worktrees to clean up",
            expired_attempts.len()
        );
        for (attempt_id, worktree_path, git_repo_path) in expired_attempts {
            Self::cleanup_expired_attempt(
                &db,
                attempt_id,
                PathBuf::from(worktree_path),
                PathBuf::from(git_repo_path),
            )
            .await
            .unwrap_or_else(|e| {
                tracing::error!("Failed to clean up expired attempt {attempt_id}: {e}",);
            });
        }
        Ok(())
    }

    pub async fn spawn_worktree_cleanup(&self) {
        let db = self.db.clone();
        let mut cleanup_interval = tokio::time::interval(tokio::time::Duration::from_secs(1800)); // 30 minutes
        self.cleanup_orphaned_worktrees().await;
        tokio::spawn(async move {
            loop {
                cleanup_interval.tick().await;
                tracing::info!("Starting periodic worktree cleanup...");
                Self::check_externally_deleted_worktrees(&db)
                    .await
                    .unwrap_or_else(|e| {
                        tracing::error!("Failed to check externally deleted worktrees: {}", e);
                    });
                Self::cleanup_expired_attempts(&db)
                    .await
                    .unwrap_or_else(|e| {
                        tracing::error!("Failed to clean up expired worktree attempts: {}", e)
                    });
            }
        });
    }

    /// Spawn a background task that polls the child process for completion and
    /// cleans up the execution entry when it exits.
    pub fn spawn_exit_monitor(&self, exec_id: &Uuid) -> JoinHandle<()> {
        let exec_id = exec_id.clone();
        let child_store = self.child_store.clone();
        let msg_stores = self.msg_stores.clone();
        let db = self.db.clone();
        let config = self.config.clone();
        let container = self.clone();
        let analytics = self.analytics.clone();

        tokio::spawn(async move {
            loop {
                let status_opt = {
                    let child_lock = {
                        let map = child_store.read().await;
                        map.get(&exec_id)
                            .cloned()
                            .expect(&format!("Child handle missing for {}", exec_id))
                    };

                    let mut child_handler = child_lock.write().await;
                    match child_handler.try_wait() {
                        Ok(Some(status)) => Some(Ok(status)),
                        Ok(None) => None,
                        Err(e) => Some(Err(e)),
                    }
                };

                // Update execution process and cleanup if exit
                if let Some(status_result) = status_opt {
                    // Update execution process record with completion info
                    let (exit_code, status) = match status_result {
                        Ok(exit_status) => {
                            let code = exit_status.code().unwrap_or(-1) as i64;
                            let status = if exit_status.success() {
                                ExecutionProcessStatus::Completed
                            } else {
                                ExecutionProcessStatus::Failed
                            };
                            (Some(code), status)
                        }
                        Err(_) => (None, ExecutionProcessStatus::Failed),
                    };

                    if let Err(e) = ExecutionProcess::update_completion(
                        &db.pool,
                        exec_id,
                        status.clone(),
                        exit_code,
                    )
                    .await
                    {
                        tracing::error!("Failed to update execution process completion: {}", e);
                    }

                    if let Ok(ctx) = ExecutionProcess::load_context(&db.pool, exec_id).await {
                        if matches!(status, ExecutionProcessStatus::Completed)
                            && exit_code == Some(0)
                        {
                            if let Err(e) = container.try_commit_changes(&ctx).await {
                                tracing::error!("Failed to commit changes after execution: {}", e);
                            }

                            // If the process exited successfully, start the next action
                            if let Err(e) = container.try_start_next_action(&ctx).await {
                                tracing::error!(
                                    "Failed to start next action after completion: {}",
                                    e
                                );
                            } else {
                                tracing::debug!(
                                    "Successfully started next action after completion: {}",
                                    ctx.task_attempt.id
                                );
                            }
                        }

                        if Self::should_notify(&ctx) {
                            let notify_cfg = config.read().await.notifications.clone();
                            NotificationService::notify_execution_halted(notify_cfg, &ctx).await;
                        }

                        // Fire event when CodingAgent execution has finished
                        if matches!(
                            &ctx.execution_process.run_reason,
                            ExecutionProcessRunReason::CodingAgent
                        ) {
                            if let Some(analytics) = &analytics {
                                analytics.analytics_service.track_event(&analytics.user_id, "task_attempt_finished", Some(json!({
                                    "task_id": ctx.task.id.to_string(),
                                    "project_id": ctx.task.project_id.to_string(),
                                    "attempt_id": ctx.task_attempt.id.to_string(),
                                    "execution_success": matches!(ctx.execution_process.status, ExecutionProcessStatus::Completed),
                                    "exit_code": ctx.execution_process.exit_code,
                                })));
                            }
                        }
                    }

                    // Cleanup msg store
                    if let Some(msg_arc) = msg_stores.write().await.remove(&exec_id) {
                        msg_arc.push_finished();
                        tokio::time::sleep(Duration::from_millis(50)).await; // Wait for the finish message to propogate
                        match Arc::try_unwrap(msg_arc) {
                            Ok(inner) => drop(inner),
                            Err(arc) => tracing::error!(
                                "There are still {} strong Arcs to MsgStore for {}",
                                Arc::strong_count(&arc),
                                exec_id
                            ),
                        }
                    }

                    // Cleanup child handle
                    child_store.write().await.remove(&exec_id);
                    break;
                }

                // still running, sleep and try again
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        })
    }

    pub fn dir_name_from_task_attempt(attempt_id: &Uuid, task_title: &str) -> String {
        let task_title_id = git_branch_id(task_title);
        format!("vk-{}-{}", short_uuid(attempt_id), task_title_id)
    }

    async fn track_child_msgs_in_store(&self, id: Uuid, child: &mut AsyncGroupChild) {
        let store = Arc::new(MsgStore::new());

        let out = child.inner().stdout.take().expect("no stdout");
        let err = child.inner().stderr.take().expect("no stderr");

        // Map stdout bytes -> LogMsg::Stdout
        let out = ReaderStream::new(out)
            .map_ok(|chunk| LogMsg::Stdout(String::from_utf8_lossy(&chunk).into_owned()));

        // Map stderr bytes -> LogMsg::Stderr
        let err = ReaderStream::new(err)
            .map_ok(|chunk| LogMsg::Stderr(String::from_utf8_lossy(&chunk).into_owned()));

        // If you have a JSON Patch source, map it to LogMsg::JsonPatch too, then select all three.

        // Merge and forward into the store
        let merged = select(out, err); // Stream<Item = Result<LogMsg, io::Error>>
        store.clone().spawn_forwarder(merged);

        let mut map = self.msg_stores().write().await;
        map.insert(id, store);
    }
}

#[async_trait]
impl ContainerService for LocalContainerService {
    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>> {
        &self.msg_stores
    }

    fn db(&self) -> &DBService {
        &self.db
    }

    fn git(&self) -> &GitService {
        &self.git
    }

    fn task_attempt_to_current_dir(&self, task_attempt: &TaskAttempt) -> PathBuf {
        PathBuf::from(task_attempt.container_ref.clone().unwrap_or_default())
    }

    /// Create a container
    async fn create(&self, task_attempt: &TaskAttempt) -> Result<ContainerRef, ContainerError> {
        let task = task_attempt
            .parent_task(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let task_branch_name =
            LocalContainerService::dir_name_from_task_attempt(&task_attempt.id, &task.title);
        let worktree_path = WorktreeManager::get_worktree_base_dir().join(&task_branch_name);

        let project = task
            .parent_project(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        WorktreeManager::create_worktree(
            &project.git_repo_path,
            &task_branch_name,
            &worktree_path,
            Some(&task_attempt.base_branch),
            true, // create new branch
        )
        .await?;

        // Update both container_ref and branch in the database
        TaskAttempt::update_container_ref(
            &self.db.pool,
            task_attempt.id,
            &worktree_path.to_string_lossy(),
        )
        .await?;

        TaskAttempt::update_branch(&self.db.pool, task_attempt.id, &task_branch_name).await?;

        Ok(worktree_path.to_string_lossy().to_string())
    }

    async fn delete_inner(&self, task_attempt: &TaskAttempt) -> Result<(), ContainerError> {
        // cleanup the container, here that means deleting the worktree
        let task = task_attempt
            .parent_task(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        let git_repo_path = match Project::find_by_id(&self.db.pool, task.project_id).await {
            Ok(Some(project)) => Some(project.git_repo_path.clone()),
            Ok(None) => None,
            Err(e) => {
                tracing::error!("Failed to fetch project {}: {}", task.project_id, e);
                None
            }
        };
        WorktreeManager::cleanup_worktree(
            &PathBuf::from(task_attempt.container_ref.clone().unwrap_or_default()),
            git_repo_path.as_ref().map(|p| p.as_path()),
        )
        .await
        .unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to clean up worktree for task attempt {}: {}",
                task_attempt.id,
                e
            );
        });
        Ok(())
    }

    async fn ensure_container_exists(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<ContainerRef, ContainerError> {
        // Get required context
        let task = task_attempt
            .parent_task(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let project = task
            .parent_project(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let container_ref = task_attempt.container_ref.as_ref().ok_or_else(|| {
            ContainerError::Other(anyhow!("Container ref not found for task attempt"))
        })?;
        let worktree_path = PathBuf::from(container_ref);

        let branch_name = task_attempt
            .branch
            .as_ref()
            .ok_or_else(|| ContainerError::Other(anyhow!("Branch not found for task attempt")))?;

        WorktreeManager::ensure_worktree_exists(
            &project.git_repo_path,
            branch_name,
            &worktree_path,
        )
        .await?;

        Ok(container_ref.to_string())
    }

    async fn start_execution_inner(
        &self,
        task_attempt: &TaskAttempt,
        execution_process: &ExecutionProcess,
        executor_action: &ExecutorAction,
    ) -> Result<(), ContainerError> {
        // Get the worktree path
        let container_ref = task_attempt
            .container_ref
            .as_ref()
            .ok_or(ContainerError::Other(anyhow!(
                "Container ref not found for task attempt"
            )))?;
        let current_dir = PathBuf::from(container_ref);

        // Create the child and stream, add to execution tracker
        let mut child = executor_action.spawn(&current_dir).await?;

        self.track_child_msgs_in_store(execution_process.id, &mut child)
            .await;

        self.add_child_to_store(execution_process.id, child).await;

        // Spawn exit monitor
        let _hn = self.spawn_exit_monitor(&execution_process.id);

        Ok(())
    }

    async fn stop_execution(
        &self,
        execution_process: &ExecutionProcess,
    ) -> Result<(), ContainerError> {
        let child = self
            .get_child_from_store(&execution_process.id)
            .await
            .ok_or_else(|| {
                ContainerError::Other(anyhow!("Child process not found for execution"))
            })?;

        // Kill the child process and remove from the store
        {
            let mut child_guard = child.write().await;
            command::kill_process_group(&mut *child_guard).await?;
        }
        self.remove_child_from_store(&execution_process.id).await;

        // Mark the process finished in the MsgStore
        if let Some(msg) = self.msg_stores.write().await.remove(&execution_process.id) {
            msg.push_finished();
        }

        ExecutionProcess::update_completion(
            &self.db.pool,
            execution_process.id,
            ExecutionProcessStatus::Killed,
            None,
        )
        .await?;

        tracing::debug!(
            "Execution process {} stopped successfully",
            execution_process.id
        );

        Ok(())
    }

    async fn get_diff(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, ContainerError>
    {
        let container_ref = task_attempt
            .container_ref
            .as_ref()
            .ok_or(ContainerError::Other(anyhow!(
                "Container reference not found"
            )))?;

        let worktree_dir = PathBuf::from(&container_ref);

        // Return error if directory doesn't exist
        if !worktree_dir.exists() {
            return Err(ContainerError::Other(anyhow!(
                "Worktree directory not found"
            )));
        }

        let project_git_repo_path = task_attempt
            .parent_task(&self.db().pool)
            .await?
            .ok_or(ContainerError::Other(anyhow!("Parent task not found")))?
            .parent_project(&self.db().pool)
            .await?
            .ok_or(ContainerError::Other(anyhow!("Parent project not found")))?
            .git_repo_path;

        // Fast-exit for merged attempts - they never change
        if let Some(merge_commit_id) = &task_attempt.merge_commit {
            let existing_diff = self.git().get_enhanced_diff(
                &project_git_repo_path,
                std::path::Path::new(""),
                Some(merge_commit_id.as_str()),
                &task_attempt.base_branch,
                None::<&[&str]>,
            )?;

            let stream = futures::stream::iter(existing_diff.files.into_iter().map(|file_diff| {
                let patch = ConversationPatch::add_file_diff(file_diff);
                let event = LogMsg::JsonPatch(patch).to_sse_event();
                Ok::<_, std::io::Error>(event)
            }))
            .boxed();

            return Ok(stream);
        }

        // Get initial diff
        let initial_diff = self.git().get_enhanced_diff(
            &project_git_repo_path,
            &worktree_dir,
            None,
            &task_attempt.base_branch,
            None::<&[&str]>,
        )?;

        // Create initial stream
        let initial_stream =
            futures::stream::iter(initial_diff.files.into_iter().map(|file_diff| {
                let patch = ConversationPatch::add_file_diff(file_diff);
                let event = LogMsg::JsonPatch(patch).to_sse_event();
                Ok::<_, std::io::Error>(event)
            }));

        // Create live diff stream for ongoing changes
        let git_service = self.git().clone();
        let project_repo_path = project_git_repo_path.clone();
        let base_branch = task_attempt.base_branch.clone();
        let worktree_path = worktree_dir.clone();

        let live_stream = try_stream! {
            // Create filesystem watcher
            let (_debouncer, mut rx, canonical_worktree_path) = filesystem_watcher::async_watcher(worktree_path.clone())
                .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;

            while let Some(res) = rx.next().await {
                match res {
                    Ok(events) => {
                        // Extract changed file paths relative to worktree
                        let changed_paths: Vec<String> = events
                            .iter()
                            .flat_map(|event| &event.paths)
                            .filter_map(|path| {
                                // Try canonical first, fall back to original for non-macOS paths
                                path.strip_prefix(&canonical_worktree_path)
                                    .or_else(|_| path.strip_prefix(&worktree_path))
                                    .ok()
                                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                            })
                            .collect();

                        if !changed_paths.is_empty() {
                            // Generate diff for only the changed files
                            let diff = git_service.get_enhanced_diff(
                                &project_repo_path,
                                &worktree_path,
                                None,
                                &base_branch,
                                Some(&changed_paths),
                            ).map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;

                            // Track which files still have diffs
                            let mut still_dirty: HashSet<String> = HashSet::new();

                            // Send ADD/REPLACE messages for files that still have diffs
                            for file_diff in diff.files {
                                still_dirty.insert(file_diff.path.clone());
                                let patch = ConversationPatch::add_file_diff(file_diff);
                                let event = LogMsg::JsonPatch(patch).to_sse_event();
                                yield event;
                            }

                            // Send REMOVE messages for files that changed but no longer have diffs
                            for path in &changed_paths {
                                if !still_dirty.contains(path) {
                                    let patch = ConversationPatch::remove_file_diff(path);
                                    let event = LogMsg::JsonPatch(patch).to_sse_event();
                                    yield event;
                                }
                            }
                        }
                    }
                    Err(errors) => {
                        // Convert filesystem watcher errors to io::Error
                        let error_msg = errors
                            .iter()
                            .map(|e| e.to_string())
                            .collect::<Vec<_>>()
                            .join("; ");
                        Err(io::Error::new(io::ErrorKind::Other, error_msg))?;
                    }
                }
            }
        };

        // Combine initial snapshot with live updates
        let combined_stream = select(initial_stream, live_stream);
        Ok(combined_stream.boxed())
    }

    async fn try_commit_changes(&self, ctx: &ExecutionContext) -> Result<(), ContainerError> {
        if !matches!(
            ctx.execution_process.run_reason,
            ExecutionProcessRunReason::CodingAgent | ExecutionProcessRunReason::CleanupScript,
        ) {
            return Ok(());
        }

        let message = match ctx.execution_process.run_reason {
            ExecutionProcessRunReason::CodingAgent => {
                // Try to retrieve the task summary from the executor session
                // otherwise fallback to default message
                match ExecutorSession::find_by_execution_process_id(
                    &self.db().pool,
                    ctx.execution_process.id,
                )
                .await
                {
                    Ok(Some(session)) if session.summary.is_some() => session.summary.unwrap(),
                    Ok(_) => {
                        tracing::debug!(
                            "No summary found for execution process {}, using default message",
                            ctx.execution_process.id
                        );
                        format!(
                            "Commit changes from coding agent for task attempt {}",
                            ctx.task_attempt.id
                        )
                    }
                    Err(e) => {
                        tracing::debug!(
                            "Failed to retrieve summary for execution process {}: {}",
                            ctx.execution_process.id,
                            e
                        );
                        format!(
                            "Commit changes from coding agent for task attempt {}",
                            ctx.task_attempt.id
                        )
                    }
                }
            }
            ExecutionProcessRunReason::CleanupScript => {
                format!(
                    "Cleanup script changes for task attempt {}",
                    ctx.task_attempt.id
                )
            }
            _ => Err(ContainerError::Other(anyhow::anyhow!(
                "Invalid run reason for commit"
            )))?,
        };

        let container_ref = ctx.task_attempt.container_ref.as_ref().ok_or_else(|| {
            ContainerError::Other(anyhow::anyhow!("Container reference not found"))
        })?;

        tracing::debug!(
            "Committing changes for task attempt {} at path {:?}: '{}'",
            ctx.task_attempt.id,
            &container_ref,
            message
        );

        Ok(self.git().commit(Path::new(container_ref), &message)?)
    }
}
