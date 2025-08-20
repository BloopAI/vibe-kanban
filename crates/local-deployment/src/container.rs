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
        merge::Merge,
        project::Project,
        task::{Task, TaskStatus},
        task_attempt::TaskAttempt,
    },
};
use deployment::DeploymentError;
use executors::{
    actions::{Executable, ExecutorAction},
    logs::{
        NormalizedEntry, NormalizedEntryType,
        utils::{ConversationPatch, patch::escape_json_pointer_segment},
    },
};
use futures::{StreamExt, TryStreamExt, stream::select};
use notify_debouncer_full::DebouncedEvent;
use serde_json::json;
use services::services::{
    analytics::AnalyticsContext,
    config::Config,
    container::{ContainerError, ContainerRef, ContainerService},
    filesystem_watcher,
    git::{DiffTarget, GitService},
    image::ImageService,
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
    image_service: ImageService,
    analytics: Option<AnalyticsContext>,
}

impl LocalContainerService {
    pub fn new(
        db: DBService,
        msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
        config: Arc<RwLock<Config>>,
        git: GitService,
        image_service: ImageService,
        analytics: Option<AnalyticsContext>,
    ) -> Self {
        let child_store = Arc::new(RwLock::new(HashMap::new()));

        LocalContainerService {
            db,
            child_store,
            msg_stores,
            config,
            git,
            image_service,
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

    /// A context is finalized when
    /// - The next action is None (no follow-up actions)
    /// - The run reason is not DevServer
    fn should_finalize(ctx: &ExecutionContext) -> bool {
        ctx.execution_process
            .executor_action()
            .unwrap()
            .next_action
            .is_none()
            && (!matches!(
                ctx.execution_process.run_reason,
                ExecutionProcessRunReason::DevServer
            ))
    }

    /// Finalize task execution by updating status to InReview and sending notifications
    async fn finalize_task(db: &DBService, config: &Arc<RwLock<Config>>, ctx: &ExecutionContext) {
        if let Err(e) = Task::update_status(&db.pool, ctx.task.id, TaskStatus::InReview).await {
            tracing::error!("Failed to update task status to InReview: {e}");
        }
        let notify_cfg = config.read().await.notifications.clone();
        NotificationService::notify_execution_halted(notify_cfg, ctx).await;
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
                db,
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
        let exec_id = *exec_id;
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
                            .unwrap_or_else(|| panic!("Child handle missing for {exec_id}"))
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

                    if !ExecutionProcess::was_killed(&db.pool, exec_id).await
                        && let Err(e) = ExecutionProcess::update_completion(
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
                        // Update executor session summary if available
                        if let Err(e) = container.update_executor_session_summary(&exec_id).await {
                            tracing::warn!("Failed to update executor session summary: {}", e);
                        }

                        // (moved) capture after-head commit occurs later, after commit/next-action handling

                        if matches!(
                            ctx.execution_process.status,
                            ExecutionProcessStatus::Completed
                        ) && exit_code == Some(0)
                        {
                            // Commit changes (if any) and get feedback about whether changes were made
                            let changes_committed = match container.try_commit_changes(&ctx).await {
                                Ok(committed) => committed,
                                Err(e) => {
                                    tracing::error!(
                                        "Failed to commit changes after execution: {}",
                                        e
                                    );
                                    // Treat commit failures as if changes were made to be safe
                                    true
                                }
                            };

                            // Determine whether to start the next action based on execution context
                            let should_start_next = if matches!(
                                ctx.execution_process.run_reason,
                                ExecutionProcessRunReason::CodingAgent
                            ) {
                                // Skip CleanupScript when CodingAgent produced no changes
                                changes_committed
                            } else {
                                // SetupScript always proceeds to CodingAgent
                                true
                            };

                            if should_start_next {
                                // If the process exited successfully, start the next action
                                if let Err(e) = container.try_start_next_action(&ctx).await {
                                    tracing::error!(
                                        "Failed to start next action after completion: {}",
                                        e
                                    );
                                }
                            } else {
                                tracing::info!(
                                    "Skipping cleanup script for task attempt {} - no changes made by coding agent",
                                    ctx.task_attempt.id
                                );

                                // Manually finalize task since we're bypassing normal execution flow
                                Self::finalize_task(&db, &config, &ctx).await;
                            }
                        }

                        if Self::should_finalize(&ctx) {
                            Self::finalize_task(&db, &config, &ctx).await;
                        }

                        // Fire event when CodingAgent execution has finished
                        if config.read().await.analytics_enabled == Some(true)
                            && matches!(
                                &ctx.execution_process.run_reason,
                                ExecutionProcessRunReason::CodingAgent
                            )
                            && let Some(analytics) = &analytics
                        {
                            analytics.analytics_service.track_event(&analytics.user_id, "task_attempt_finished", Some(json!({
                                    "task_id": ctx.task.id.to_string(),
                                    "project_id": ctx.task.project_id.to_string(),
                                    "attempt_id": ctx.task_attempt.id.to_string(),
                                    "execution_success": matches!(ctx.execution_process.status, ExecutionProcessStatus::Completed),
                                    "exit_code": ctx.execution_process.exit_code,
                                })));
                        }
                    }

                    // Now that commit/next-action/finalization steps for this process are complete,
                    // capture the HEAD OID as the definitive "after" state (best-effort).
                    if let Ok(ctx) = ExecutionProcess::load_context(&db.pool, exec_id).await {
                        let worktree_dir = container.task_attempt_to_current_dir(&ctx.task_attempt);
                        if let Ok(head) = container.git().get_head_info(&worktree_dir)
                            && let Err(e) = ExecutionProcess::update_after_head_commit(
                                &db.pool, exec_id, &head.oid,
                            )
                            .await
                        {
                            tracing::warn!(
                                "Failed to update after_head_commit for {}: {}",
                                exec_id,
                                e
                            );
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

    pub fn git_branch_from_task_attempt(attempt_id: &Uuid, task_title: &str) -> String {
        let task_title_id = git_branch_id(task_title);
        format!("vk/{}-{}", short_uuid(attempt_id), task_title_id)
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

    /// Get the worktree path for a task attempt
    #[allow(dead_code)]
    async fn get_worktree_path(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<PathBuf, ContainerError> {
        let container_ref = self.ensure_container_exists(task_attempt).await?;
        let worktree_dir = PathBuf::from(&container_ref);

        if !worktree_dir.exists() {
            return Err(ContainerError::Other(anyhow!(
                "Worktree directory not found"
            )));
        }

        Ok(worktree_dir)
    }

    /// Get the project repository path for a task attempt
    async fn get_project_repo_path(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<PathBuf, ContainerError> {
        let project_repo_path = task_attempt
            .parent_task(&self.db().pool)
            .await?
            .ok_or(ContainerError::Other(anyhow!("Parent task not found")))?
            .parent_project(&self.db().pool)
            .await?
            .ok_or(ContainerError::Other(anyhow!("Parent project not found")))?
            .git_repo_path;

        Ok(project_repo_path)
    }

    /// Create a diff stream for merged attempts (never changes)
    fn create_merged_diff_stream(
        &self,
        project_repo_path: &Path,
        merge_commit_id: &str,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, ContainerError>
    {
        let diffs = self.git().get_diffs(
            DiffTarget::Commit {
                repo_path: project_repo_path,
                commit_sha: merge_commit_id,
            },
            None,
        )?;

        let stream = futures::stream::iter(diffs.into_iter().map(|diff| {
            let entry_index = GitService::diff_path(&diff);
            let patch =
                ConversationPatch::add_diff(escape_json_pointer_segment(&entry_index), diff);
            let event = LogMsg::JsonPatch(patch).to_sse_event();
            Ok::<_, std::io::Error>(event)
        }))
        .chain(futures::stream::once(async {
            Ok::<_, std::io::Error>(LogMsg::Finished.to_sse_event())
        }))
        .boxed();

        Ok(stream)
    }

    /// Create a live diff stream for ongoing attempts
    async fn create_live_diff_stream(
        &self,
        worktree_path: &Path,
        task_branch: &str,
        base_branch: &str,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, ContainerError>
    {
        // Get initial snapshot
        let git_service = self.git().clone();
        let initial_diffs = git_service.get_diffs(
            DiffTarget::Worktree {
                worktree_path,
                branch_name: task_branch,
                base_branch,
            },
            None,
        )?;

        let initial_stream = futures::stream::iter(initial_diffs.into_iter().map(|diff| {
            let entry_index = GitService::diff_path(&diff);
            let patch =
                ConversationPatch::add_diff(escape_json_pointer_segment(&entry_index), diff);
            let event = LogMsg::JsonPatch(patch).to_sse_event();
            Ok::<_, std::io::Error>(event)
        }))
        .boxed();

        // Create live update stream
        let worktree_path = worktree_path.to_path_buf();
        let task_branch = task_branch.to_string();
        let base_branch = base_branch.to_string();

        let live_stream = {
            let git_service = git_service.clone();
            try_stream! {
                let (_debouncer, mut rx, canonical_worktree_path) =
                    filesystem_watcher::async_watcher(worktree_path.clone())
                        .map_err(|e| io::Error::other(e.to_string()))?;

                while let Some(result) = rx.next().await {
                    match result {
                        Ok(events) => {
                            let changed_paths = Self::extract_changed_paths(&events, &canonical_worktree_path, &worktree_path);

                            if !changed_paths.is_empty() {
                                for event in Self::process_file_changes(
                                    &git_service,
                                    &worktree_path,
                                    &task_branch,
                                    &base_branch,
                                    &changed_paths,
                                ).map_err(|e| {
                                    tracing::error!("Error processing file changes: {}", e);
                                    io::Error::other(e.to_string())
                                })? {
                                    yield event;
                                }
                            }
                        }
                        Err(errors) => {
                            let error_msg = errors.iter()
                                .map(|e| e.to_string())
                                .collect::<Vec<_>>()
                                .join("; ");
                            tracing::error!("Filesystem watcher error: {}", error_msg);
                            Err(io::Error::other(error_msg))?;
                        }
                    }
                }
            }
        }.boxed();

        let combined_stream = select(initial_stream, live_stream);
        Ok(combined_stream.boxed())
    }

    /// Extract changed file paths from filesystem events
    fn extract_changed_paths(
        events: &[DebouncedEvent],
        canonical_worktree_path: &Path,
        worktree_path: &Path,
    ) -> Vec<String> {
        events
            .iter()
            .flat_map(|event| &event.paths)
            .filter_map(|path| {
                path.strip_prefix(canonical_worktree_path)
                    .or_else(|_| path.strip_prefix(worktree_path))
                    .ok()
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
            })
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// Process file changes and generate diff events
    fn process_file_changes(
        git_service: &GitService,
        worktree_path: &Path,
        task_branch: &str,
        base_branch: &str,
        changed_paths: &[String],
    ) -> Result<Vec<Event>, ContainerError> {
        let path_filter: Vec<&str> = changed_paths.iter().map(|s| s.as_str()).collect();

        let current_diffs = git_service.get_diffs(
            DiffTarget::Worktree {
                worktree_path,
                branch_name: task_branch,
                base_branch,
            },
            Some(&path_filter),
        )?;

        let mut events = Vec::new();
        let mut files_with_diffs = HashSet::new();

        // Add/update files that have diffs
        for diff in current_diffs {
            let file_path = GitService::diff_path(&diff);
            files_with_diffs.insert(file_path.clone());

            let patch = ConversationPatch::add_diff(escape_json_pointer_segment(&file_path), diff);
            let event = LogMsg::JsonPatch(patch).to_sse_event();
            events.push(event);
        }

        // Remove files that changed but no longer have diffs
        for changed_path in changed_paths {
            if !files_with_diffs.contains(changed_path) {
                let patch =
                    ConversationPatch::remove_diff(escape_json_pointer_segment(changed_path));
                let event = LogMsg::JsonPatch(patch).to_sse_event();
                events.push(event);
            }
        }

        Ok(events)
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

        let worktree_dir_name =
            LocalContainerService::dir_name_from_task_attempt(&task_attempt.id, &task.title);
        let worktree_path = WorktreeManager::get_worktree_base_dir().join(&worktree_dir_name);

        let git_branch_name =
            LocalContainerService::git_branch_from_task_attempt(&task_attempt.id, &task.title);

        let project = task
            .parent_project(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        WorktreeManager::create_worktree(
            &project.git_repo_path,
            &git_branch_name,
            &worktree_path,
            &task_attempt.base_branch,
            true, // create new branch
        )
        .await?;

        // Copy files specified in the project's copy_files field
        if let Some(copy_files) = &project.copy_files
            && !copy_files.trim().is_empty()
        {
            self.copy_project_files(&project.git_repo_path, &worktree_path, copy_files)
                .await
                .unwrap_or_else(|e| {
                    tracing::warn!("Failed to copy project files: {}", e);
                });
        }

        // Copy task images from cache to worktree
        if let Err(e) = self
            .image_service
            .copy_images_by_task_to_worktree(&worktree_path, task.id)
            .await
        {
            tracing::warn!("Failed to copy task images to worktree: {}", e);
        }

        // Update both container_ref and branch in the database
        TaskAttempt::update_container_ref(
            &self.db.pool,
            task_attempt.id,
            &worktree_path.to_string_lossy(),
        )
        .await?;

        TaskAttempt::update_branch(&self.db.pool, task_attempt.id, &git_branch_name).await?;

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
            git_repo_path.as_deref(),
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

    async fn is_container_clean(&self, task_attempt: &TaskAttempt) -> Result<bool, ContainerError> {
        if let Some(container_ref) = &task_attempt.container_ref {
            // If container_ref is set, check if the worktree exists
            let path = PathBuf::from(container_ref);
            if path.exists() {
                self.git().is_worktree_clean(&path).map_err(|e| e.into())
            } else {
                return Ok(true); // No worktree means it's clean
            }
        } else {
            return Ok(true); // No container_ref means no worktree, so it's clean
        }
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
        ExecutionProcess::update_completion(
            &self.db.pool,
            execution_process.id,
            ExecutionProcessStatus::Killed,
            None,
        )
        .await?;

        // Kill the child process and remove from the store
        {
            let mut child_guard = child.write().await;
            if let Err(e) = command::kill_process_group(&mut child_guard).await {
                tracing::error!(
                    "Failed to stop execution process {}: {}",
                    execution_process.id,
                    e
                );
                return Err(e);
            }
        }
        self.remove_child_from_store(&execution_process.id).await;

        // Mark the process finished in the MsgStore
        if let Some(msg) = self.msg_stores.write().await.remove(&execution_process.id) {
            msg.push_finished();
        }

        // Update task status to InReview when execution is stopped
        if let Ok(ctx) = ExecutionProcess::load_context(&self.db.pool, execution_process.id).await
            && !matches!(
                ctx.execution_process.run_reason,
                ExecutionProcessRunReason::DevServer
            )
            && let Err(e) =
                Task::update_status(&self.db.pool, ctx.task.id, TaskStatus::InReview).await
        {
            tracing::error!("Failed to update task status to InReview: {e}");
        }

        tracing::debug!(
            "Execution process {} stopped successfully",
            execution_process.id
        );

        // Record after-head commit OID (best-effort)
        if let Ok(ctx) = ExecutionProcess::load_context(&self.db.pool, execution_process.id).await {
            let worktree = self.task_attempt_to_current_dir(&ctx.task_attempt);
            if let Ok(head) = self.git().get_head_info(&worktree) {
                let _ = ExecutionProcess::update_after_head_commit(
                    &self.db.pool,
                    execution_process.id,
                    &head.oid,
                )
                .await;
            }
        }

        Ok(())
    }

    async fn get_diff(
        &self,
        task_attempt: &TaskAttempt,
    ) -> Result<futures::stream::BoxStream<'static, Result<Event, std::io::Error>>, ContainerError>
    {
        let project_repo_path = self.get_project_repo_path(task_attempt).await?;
        let latest_merge =
            Merge::find_latest_by_task_attempt_id(&self.db.pool, task_attempt.id).await?;
        let task_branch = task_attempt
            .branch
            .clone()
            .ok_or(ContainerError::Other(anyhow!(
                "Task attempt {} does not have a branch",
                task_attempt.id
            )))?;

        let is_ahead = if let Ok((ahead, _)) = self.git().get_branch_status(
            &project_repo_path,
            &task_branch,
            &task_attempt.base_branch,
        ) {
            ahead > 0
        } else {
            false
        };

        // Show merged diff when no new work is on the branch or container
        if let Some(merge) = &latest_merge
            && let Some(commit) = merge.merge_commit()
            && self.is_container_clean(task_attempt).await?
            && !is_ahead
        {
            return self.create_merged_diff_stream(&project_repo_path, &commit);
        }

        // worktree is needed for non-merged diffs
        let container_ref = self.ensure_container_exists(task_attempt).await?;
        let worktree_path = PathBuf::from(container_ref);

        // Handle ongoing attempts (live streaming diff)
        self.create_live_diff_stream(&worktree_path, &task_branch, &task_attempt.base_branch)
            .await
    }

    async fn try_commit_changes(&self, ctx: &ExecutionContext) -> Result<bool, ContainerError> {
        if !matches!(
            ctx.execution_process.run_reason,
            ExecutionProcessRunReason::CodingAgent | ExecutionProcessRunReason::CleanupScript,
        ) {
            return Ok(false);
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

        let changes_committed = self.git().commit(Path::new(container_ref), &message)?;
        Ok(changes_committed)
    }

    /// Copy files from the original project directory to the worktree
    async fn copy_project_files(
        &self,
        source_dir: &Path,
        target_dir: &Path,
        copy_files: &str,
    ) -> Result<(), ContainerError> {
        let files: Vec<&str> = copy_files
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        for file_path in files {
            let source_file = source_dir.join(file_path);
            let target_file = target_dir.join(file_path);

            // Create parent directories if needed
            if let Some(parent) = target_file.parent()
                && !parent.exists()
            {
                std::fs::create_dir_all(parent).map_err(|e| {
                    ContainerError::Other(anyhow!("Failed to create directory {:?}: {}", parent, e))
                })?;
            }

            // Copy the file
            if source_file.exists() {
                std::fs::copy(&source_file, &target_file).map_err(|e| {
                    ContainerError::Other(anyhow!(
                        "Failed to copy file {:?} to {:?}: {}",
                        source_file,
                        target_file,
                        e
                    ))
                })?;
                tracing::info!("Copied file {:?} to worktree", file_path);
            } else {
                return Err(ContainerError::Other(anyhow!(
                    "File {:?} does not exist in the project directory",
                    source_file
                )));
            }
        }
        Ok(())
    }
}

impl LocalContainerService {
    /// Extract the last assistant message from the MsgStore history
    fn extract_last_assistant_message(&self, exec_id: &Uuid) -> Option<String> {
        // Get the MsgStore for this execution
        let msg_stores = self.msg_stores.try_read().ok()?;
        let msg_store = msg_stores.get(exec_id)?;

        // Get the history and scan in reverse for the last assistant message
        let history = msg_store.get_history();

        for msg in history.iter().rev() {
            if let LogMsg::JsonPatch(patch) = msg {
                // Try to extract a NormalizedEntry from the patch
                if let Some(entry) = self.extract_normalized_entry_from_patch(patch)
                    && matches!(entry.entry_type, NormalizedEntryType::AssistantMessage)
                {
                    let content = entry.content.trim();
                    if !content.is_empty() {
                        // Truncate to reasonable size (4KB as Oracle suggested)
                        const MAX_SUMMARY_LENGTH: usize = 4096;
                        if content.len() > MAX_SUMMARY_LENGTH {
                            return Some(format!("{}...", &content[..MAX_SUMMARY_LENGTH]));
                        }
                        return Some(content.to_string());
                    }
                }
            }
        }

        None
    }

    /// Extract a NormalizedEntry from a JsonPatch if it contains one
    fn extract_normalized_entry_from_patch(
        &self,
        patch: &json_patch::Patch,
    ) -> Option<NormalizedEntry> {
        // Convert the patch to JSON to examine its structure
        if let Ok(patch_json) = serde_json::to_value(patch)
            && let Some(operations) = patch_json.as_array()
        {
            for operation in operations {
                if let Some(value) = operation.get("value") {
                    // Try to extract a NormalizedEntry from the value
                    if let Some(patch_type) = value.get("type").and_then(|t| t.as_str())
                        && patch_type == "NORMALIZED_ENTRY"
                        && let Some(content) = value.get("content")
                        && let Ok(entry) =
                            serde_json::from_value::<NormalizedEntry>(content.clone())
                    {
                        return Some(entry);
                    }
                }
            }
        }
        None
    }

    /// Update the executor session summary with the final assistant message
    async fn update_executor_session_summary(&self, exec_id: &Uuid) -> Result<(), anyhow::Error> {
        // Check if there's an executor session for this execution process
        let session =
            ExecutorSession::find_by_execution_process_id(&self.db.pool, *exec_id).await?;

        if let Some(session) = session {
            // Only update if summary is not already set
            if session.summary.is_none() {
                if let Some(summary) = self.extract_last_assistant_message(exec_id) {
                    ExecutorSession::update_summary(&self.db.pool, *exec_id, &summary).await?;
                } else {
                    tracing::debug!("No assistant message found for execution {}", exec_id);
                }
            }
        }

        Ok(())
    }
}
