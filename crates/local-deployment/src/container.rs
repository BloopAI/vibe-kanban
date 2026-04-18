use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicUsize},
    time::Duration,
};

use anyhow::anyhow;
use async_trait::async_trait;
use chrono::Utc;
use command_group::AsyncGroupChild;
use db::{
    DBService,
    models::{
        draft::{Draft, DraftType},
        execution_process::{
            ExecutionContext, ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus,
        },
        execution_process_logs::ExecutionProcessLogs,
        executor_session::ExecutorSession,
        image::TaskImage,
        merge::Merge,
        project::Project,
        task::{Task, TaskStatus},
        task_attempt::TaskAttempt,
    },
};
use deployment::{DeploymentError, RemoteClientNotConfigured};
use executors::{
    actions::{Executable, ExecutorAction, SpawnContext},
    approvals::{ExecutorApprovalService, NoopExecutorApprovalService},
    executors::{BaseCodingAgent, ExecutorExitResult, ExecutorExitSignal, ProtocolPeer},
    logs::{
        NormalizedEntry, NormalizedEntryType,
        utils::{
            ConversationPatch, EntryIndexProvider,
            patch::{escape_json_pointer_segment, extract_normalized_entry_from_patch},
        },
    },
};
use futures::{FutureExt, StreamExt, TryStreamExt, stream::select};
use services::services::{
    approvals::{Approvals, executor_approvals::ExecutorApprovalBridge},
    config::Config,
    container::{ContainerError, ContainerRef, ContainerService},
    diff_stream::{self, DiffStreamHandle},
    git::{Commit, DiffTarget, GitService},
    image::ImageService,
    log_batcher::{LogBatcher, LogBatcherHandle},
    log_migration,
    normalization_metrics::NormalizationMetrics,
    share::SharePublisher,
    worktree_manager::{WorktreeCleanup, WorktreeManager},
};
use tokio::{sync::RwLock, task::JoinHandle};
use tokio_util::io::ReaderStream;
use utils::{
    log_msg::LogMsg,
    msg_store::MsgStore,
    text::{git_branch_id, short_uuid, truncate_to_char_boundary},
};
use uuid::Uuid;

use crate::command;

/// Default timeout in seconds for awaiting log normalization completion.
const DEFAULT_NORMALIZATION_TIMEOUT_SECS: u64 = 5;

/// Get the normalization timeout from environment or use default.
///
/// Returns the value of `VK_NORMALIZATION_TIMEOUT_SECS` if set and valid,
/// otherwise returns `DEFAULT_NORMALIZATION_TIMEOUT_SECS` (5 seconds).
fn normalization_timeout_secs() -> u64 {
    std::env::var("VK_NORMALIZATION_TIMEOUT_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_NORMALIZATION_TIMEOUT_SECS)
}

#[derive(Clone)]
pub struct LocalContainerService {
    db: DBService,
    child_store: Arc<RwLock<HashMap<Uuid, Arc<RwLock<AsyncGroupChild>>>>>,
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    /// Protocol peers for live message injection and agent-aware control
    /// (keyed by execution_process_id).
    protocol_peers: Arc<RwLock<HashMap<Uuid, Arc<ProtocolPeer>>>>,
    /// Entry index providers for message injection (keyed by execution_process_id).
    /// Used to track the next entry index for normalized log entries.
    entry_index_providers: Arc<RwLock<HashMap<Uuid, EntryIndexProvider>>>,
    config: Arc<RwLock<Config>>,
    git: GitService,
    image_service: ImageService,
    approvals: Approvals,
    publisher: Result<SharePublisher, RemoteClientNotConfigured>,
    log_batcher: LogBatcherHandle,
    message_queue: crate::message_queue::MessageQueueStore,
    /// Normalization task handles keyed by execution_process_id.
    /// Used to await normalization completion before signaling finished.
    normalization_handles: Arc<RwLock<HashMap<Uuid, JoinHandle<()>>>>,
    /// Metrics for tracking normalization completion times and timeouts.
    normalization_metrics: NormalizationMetrics,
    /// Unique ID for this server instance. Used for instance-scoped process cleanup
    /// on shutdown (so cargo watch restarts don't kill other instances' processes).
    instance_id: String,
}

impl LocalContainerService {
    pub async fn new(
        db: DBService,
        msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
        config: Arc<RwLock<Config>>,
        git: GitService,
        image_service: ImageService,
        approvals: Approvals,
        publisher: Result<SharePublisher, RemoteClientNotConfigured>,
    ) -> Self {
        let child_store = Arc::new(RwLock::new(HashMap::new()));
        let protocol_peers = Arc::new(RwLock::new(HashMap::new()));
        let entry_index_providers = Arc::new(RwLock::new(HashMap::new()));

        // Initialize log batcher for batched database writes
        let log_batcher = LogBatcher::spawn(&db);

        // Initialize in-memory message queue store
        let message_queue = crate::message_queue::MessageQueueStore::new();

        // Initialize normalization handles store
        let normalization_handles = Arc::new(RwLock::new(HashMap::new()));

        // Initialize normalization metrics collector
        let normalization_metrics = NormalizationMetrics::new();

        // Generate unique instance ID for this server instance.
        // Used to tag execution processes so shutdown only kills THIS instance's processes.
        let instance_id = Uuid::new_v4().to_string();
        tracing::info!(instance_id = %instance_id, "Generated server instance ID");

        let container = LocalContainerService {
            db,
            child_store,
            msg_stores,
            protocol_peers,
            entry_index_providers,
            config,
            git,
            image_service,
            approvals,
            publisher,
            log_batcher,
            message_queue,
            normalization_handles,
            normalization_metrics,
            instance_id,
        };

        container.spawn_worktree_cleanup();

        container
    }

    /// Get the normalization metrics collector.
    pub fn normalization_metrics(&self) -> &NormalizationMetrics {
        &self.normalization_metrics
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

    /// Get a protocol peer for live message injection / control.
    pub async fn get_protocol_peer(&self, exec_id: &Uuid) -> Option<Arc<ProtocolPeer>> {
        let map = self.protocol_peers.read().await;
        map.get(exec_id).cloned()
    }

    /// Store a protocol peer for message injection.
    pub async fn store_protocol_peer(&self, exec_id: Uuid, peer: Arc<ProtocolPeer>) {
        let mut map = self.protocol_peers.write().await;
        map.insert(exec_id, peer);
    }

    /// Remove a protocol peer when the process exits.
    pub async fn remove_protocol_peer(&self, exec_id: &Uuid) {
        let mut map = self.protocol_peers.write().await;
        map.remove(exec_id);
    }

    /// Get an entry index provider for log message injection.
    pub async fn get_entry_index_provider(&self, exec_id: &Uuid) -> Option<EntryIndexProvider> {
        let map = self.entry_index_providers.read().await;
        map.get(exec_id).cloned()
    }

    /// Store an entry index provider for log message injection.
    pub async fn store_entry_index_provider(&self, exec_id: Uuid, provider: EntryIndexProvider) {
        let mut map = self.entry_index_providers.write().await;
        map.insert(exec_id, provider);
    }

    /// Remove an entry index provider when the process exits.
    pub async fn remove_entry_index_provider(&self, exec_id: &Uuid) {
        let mut map = self.entry_index_providers.write().await;
        map.remove(exec_id);
    }

    /// Store a normalization task handle for an execution process.
    pub async fn store_normalization_handle(&self, exec_id: Uuid, handle: JoinHandle<()>) {
        let mut map = self.normalization_handles.write().await;
        map.insert(exec_id, handle);
    }

    /// Take (remove and return) a normalization handle for an execution process.
    /// Returns None if no handle was stored for this execution.
    pub async fn take_normalization_handle(&self, exec_id: &Uuid) -> Option<JoinHandle<()>> {
        let mut map = self.normalization_handles.write().await;
        map.remove(exec_id)
    }

    /// Get the in-memory message queue store.
    pub fn message_queue(&self) -> &crate::message_queue::MessageQueueStore {
        &self.message_queue
    }

    /// Defensively check for externally deleted worktrees and mark them as deleted in the database
    async fn check_externally_deleted_worktrees(db: &DBService) -> Result<(), DeploymentError> {
        let active_attempts = TaskAttempt::find_by_worktree_deleted(&db.pool).await?;
        tracing::debug!(
            "Checking {} active worktrees for external deletion...",
            active_attempts.len()
        );
        for (attempt_id, worktree_path, updated_at) in active_attempts {
            // Skip attempts whose container_ref was set very recently — with the DB-first
            // ordering in `create()`, there is a brief window where the path is in the DB
            // but the directory hasn't been created on disk yet (RC-3).
            let age = Utc::now() - updated_at;
            if age < chrono::Duration::seconds(60) {
                tracing::debug!(
                    attempt_id = %attempt_id,
                    "Skipping recently-updated attempt in external deletion check (grace period)"
                );
                continue;
            }
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

    /// Find and delete orphaned worktrees that don't correspond to any task attempts.
    /// This is a static method to allow calling from background tasks.
    async fn cleanup_orphaned_worktrees(db: &DBService) {
        // Check if orphan cleanup is disabled via environment variable
        // Only "1" or "true" (case-insensitive) disables cleanup; unset or "0"/"false" enables it
        if std::env::var("DISABLE_WORKTREE_ORPHAN_CLEANUP")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            tracing::debug!(
                "Orphan worktree cleanup is disabled via DISABLE_WORKTREE_ORPHAN_CLEANUP=1"
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
            if let Ok(false) = TaskAttempt::container_ref_exists(&db.pool, &worktree_path_str).await
            {
                // This is an orphaned worktree - delete it
                tracing::info!("Found orphaned worktree: {}", worktree_path_str);
                if let Err(e) =
                    WorktreeManager::cleanup_worktree(&WorktreeCleanup::new(path, None)).await
                {
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
        // Safety check: don't delete worktrees with uncommitted changes
        if worktree_path.exists() {
            let git = GitService {};
            match git.get_dirty_files(&worktree_path) {
                Ok(dirty_files) if !dirty_files.is_empty() => {
                    tracing::warn!(
                        attempt_id = %attempt_id,
                        dirty_file_count = dirty_files.len(),
                        path = %worktree_path.display(),
                        "Skipping cleanup of expired worktree with uncommitted changes"
                    );
                    return Ok(());
                }
                Err(e) => {
                    tracing::warn!(
                        attempt_id = %attempt_id,
                        path = %worktree_path.display(),
                        error = %e,
                        "Failed to check for uncommitted changes, skipping cleanup for safety"
                    );
                    return Ok(());
                }
                Ok(_) => {
                    // No dirty files, safe to proceed with cleanup
                }
            }
        }

        // Re-validate: abort if a process became active since we queried the expiry list (RC-4).
        // The exclusion in `find_expired_for_cleanup` is not atomic with this deletion.
        let running =
            ExecutionProcess::find_by_task_attempt_id(&db.pool, attempt_id, false).await?;
        if running.iter().any(|p| p.completed_at.is_none()) {
            tracing::info!(
                attempt_id = %attempt_id,
                "Skipping expired worktree cleanup: found running execution process"
            );
            return Ok(());
        }

        WorktreeManager::cleanup_worktree(&WorktreeCleanup::new(
            worktree_path,
            Some(git_repo_path),
        ))
        .await?;
        // Mark worktree as deleted in database after successful cleanup
        TaskAttempt::mark_worktree_deleted(&db.pool, attempt_id).await?;
        tracing::info!("Successfully marked worktree as deleted for attempt {attempt_id}",);
        Ok(())
    }

    pub async fn cleanup_expired_attempts(db: &DBService) -> Result<(), DeploymentError> {
        // Check if expired cleanup is disabled via environment variable
        // Only "1" or "true" (case-insensitive) disables cleanup; unset or "0"/"false" enables it
        if std::env::var("DISABLE_WORKTREE_EXPIRED_CLEANUP")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            tracing::debug!(
                "Expired worktree cleanup is disabled via DISABLE_WORKTREE_EXPIRED_CLEANUP=1"
            );
            return Ok(());
        }

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

    pub fn spawn_worktree_cleanup(&self) {
        let db = self.db.clone();
        tokio::spawn(async move {
            // Run initial orphan cleanup in background (non-blocking startup)
            tracing::debug!("Starting initial worktree cleanup in background...");
            Self::cleanup_orphaned_worktrees(&db).await;
            tracing::debug!("Initial worktree cleanup completed");

            // Periodic cleanup every 30 minutes
            let mut cleanup_interval =
                tokio::time::interval(tokio::time::Duration::from_secs(1800));
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
    pub fn spawn_exit_monitor(
        &self,
        exec_id: &Uuid,
        exit_signal: Option<ExecutorExitSignal>,
    ) -> JoinHandle<()> {
        let exec_id = *exec_id;
        let child_store = self.child_store.clone();
        let msg_stores = self.msg_stores.clone();
        let db = self.db.clone();
        let container = self.clone();
        let publisher = self.publisher.clone();

        let mut process_exit_rx = self.spawn_os_exit_watcher(exec_id);

        tokio::spawn(async move {
            let mut exit_signal_future = exit_signal
                .map(|rx| rx.boxed()) // wait for result
                .unwrap_or_else(|| std::future::pending().boxed()); // no signal, stall forever

            let status_result: std::io::Result<std::process::ExitStatus>;

            // Track completion reason from executor exit signal
            let mut completion_reason: Option<executors::executors::SessionCompletionReason> = None;

            // Wait for process to exit, or exit signal from executor
            tokio::select! {
                // Exit signal with result.
                // Some coding agent processes do not automatically exit after processing the user request; instead the executor
                // signals when processing has finished to gracefully kill the process.
                exit_result = &mut exit_signal_future => {
                    // Executor signaled completion: kill group and use the provided result
                    const LOCK_TIMEOUT: Duration = Duration::from_secs(5);
                    if let Some(child_lock) = child_store.read().await.get(&exec_id).cloned() {
                        match tokio::time::timeout(LOCK_TIMEOUT, child_lock.write()).await {
                            Ok(mut child) => {
                                if let Err(err) = command::kill_process_group(&mut child).await {
                                    tracing::error!("Failed to kill process group after exit signal: {} {}", exec_id, err);
                                }
                            }
                            Err(_) => {
                                tracing::warn!(
                                    exec_id = %exec_id,
                                    timeout_secs = LOCK_TIMEOUT.as_secs(),
                                    "exit monitor: child lock acquisition timed out"
                                );
                            }
                        }
                    }

                    // Map the exit result to appropriate exit status and capture completion reason
                    status_result = match &exit_result {
                        Ok(ExecutorExitResult::Success { reason }) => {
                            completion_reason = Some(reason.clone());
                            Ok(success_exit_status())
                        }
                        Ok(ExecutorExitResult::Failure { reason }) => {
                            completion_reason = Some(reason.clone());
                            Ok(failure_exit_status())
                        }
                        Err(_) => Ok(success_exit_status()), // Channel closed, assume success
                    };
                }
                // Process exit
                exit_status_result = &mut process_exit_rx => {
                    status_result = exit_status_result.unwrap_or_else(|e| Err(std::io::Error::other(e)));
                }
            }

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

            // Extract completion_reason and completion_message for database storage
            let (reason_str, message_str): (Option<&str>, Option<String>) = match &completion_reason
            {
                Some(reason) => {
                    let reason_str = reason.as_str();
                    let message = match reason {
                        executors::executors::SessionCompletionReason::Error { message } => {
                            Some(message.clone())
                        }
                        _ => None,
                    };
                    (Some(reason_str), message)
                }
                None => (None, None),
            };

            if !ExecutionProcess::was_stopped(&db.pool, exec_id).await
                && let Err(e) = ExecutionProcess::update_completion(
                    &db.pool,
                    exec_id,
                    status.clone(),
                    exit_code,
                    reason_str,
                    message_str.as_deref(),
                )
                .await
            {
                tracing::error!("Failed to update execution process completion: {}", e);
            }

            // Run normalization to populate log_entries with JsonPatch entries for REST pagination
            // This processes the raw JSONL from execution_process_logs and creates normalized entries
            match log_migration::migrate_execution_logs(&db.pool, exec_id).await {
                Ok(result) => {
                    tracing::info!(
                        exec_id = %exec_id,
                        migrated = result.migrated,
                        errors = result.errors,
                        "Normalized logs for completed execution"
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        exec_id = %exec_id,
                        error = %e,
                        "Failed to normalize logs for completed execution"
                    );
                }
            }

            // Fire webhooks for executor_finish (fire-and-forget, non-blocking)
            {
                use services::services::webhook::WebhookService;
                let pool_clone = db.pool.clone();
                let status_str = format!("{status:?}").to_lowercase();
                let reason_owned = reason_str.map(|s| s.to_string());
                let exit_code_clone = exit_code;
                let exec_id_clone = exec_id;
                tokio::spawn(async move {
                    if let Some(ctx) = WebhookService::build_finish_context(
                        &pool_clone,
                        exec_id_clone,
                        status_str,
                        reason_owned,
                        exit_code_clone,
                    )
                    .await
                    {
                        let project_id = ctx.project_id;
                        WebhookService::fire(&pool_clone, project_id, ctx).await;
                    } else {
                        tracing::debug!(
                            exec_id = %exec_id_clone,
                            "webhook: could not build finish context, event not delivered"
                        );
                    }
                });
            }

            // Check for session invalid error and mark session as invalid to avoid retry
            // This handles "No conversation found with session ID" errors from Claude Code
            if status == ExecutionProcessStatus::Failed
                && let Ok(true) =
                    ExecutionProcessLogs::contains_session_invalid_error(&db.pool, exec_id).await
            {
                // Find and mark the session as invalid so it won't be tried again
                if let Ok(Some(session_id)) =
                    ExecutionProcess::find_latest_session_id_by_task_attempt(&db.pool, {
                        // Get task_attempt_id from execution process
                        if let Ok(ctx) = ExecutionProcess::load_context(&db.pool, exec_id).await {
                            ctx.task_attempt.id
                        } else {
                            // Can't get context, skip marking
                            tracing::warn!(
                                exec_id = %exec_id,
                                "Session invalid error detected but couldn't load context"
                            );
                            uuid::Uuid::nil() // Will return None
                        }
                    })
                    .await
                {
                    tracing::warn!(
                        exec_id = %exec_id,
                        session_id = %session_id,
                        "Marking session as invalid due to 'No conversation found' error"
                    );
                    if let Err(e) =
                        ExecutorSession::mark_session_invalid(&db.pool, &session_id).await
                    {
                        tracing::error!(
                            exec_id = %exec_id,
                            error = %e,
                            "Failed to mark session as invalid"
                        );
                    }
                }
            }

            if let Ok(ctx) = ExecutionProcess::load_context(&db.pool, exec_id).await {
                // Diagnostic logging for exit monitor context
                tracing::info!(
                    exec_id = %exec_id,
                    exit_code = ?exit_code,
                    process_status = ?ctx.execution_process.status,
                    run_reason = ?ctx.execution_process.run_reason,
                    task_attempt_id = %ctx.task_attempt.id,
                    "Exit monitor: Process exited, evaluating next steps"
                );

                // Update executor session summary if available
                if let Err(e) = container.update_executor_session_summary(&exec_id).await {
                    tracing::warn!("Failed to update executor session summary: {}", e);
                }

                let success = matches!(
                    ctx.execution_process.status,
                    ExecutionProcessStatus::Completed
                ) && exit_code == Some(0);

                let cleanup_done = matches!(
                    ctx.execution_process.run_reason,
                    ExecutionProcessRunReason::CleanupScript
                ) && !matches!(
                    ctx.execution_process.status,
                    ExecutionProcessStatus::Running
                );

                if success || cleanup_done {
                    tracing::info!(
                        exec_id = %exec_id,
                        success = success,
                        cleanup_done = cleanup_done,
                        "Exit monitor: Process eligible for commit/next-action (success={} OR cleanup_done={})",
                        success, cleanup_done
                    );

                    // Commit changes (if any) and get feedback about whether changes were made
                    let changes_committed = match container.try_commit_changes(&ctx).await {
                        Ok(committed) => committed,
                        Err(e) => {
                            tracing::error!("Failed to commit changes after execution: {}", e);
                            // Treat commit failures as if changes were made to be safe
                            true
                        }
                    };

                    tracing::info!(
                        exec_id = %exec_id,
                        changes_committed = changes_committed,
                        run_reason = ?ctx.execution_process.run_reason,
                        "Exit monitor: Process completed, proceeding to next action"
                    );

                    // Always proceed to next action (cleanup script) regardless of whether
                    // changes were committed. The agent may have done valuable work that
                    // doesn't involve file changes (e.g., browser testing, running tests).
                    if let Err(e) = container.try_start_next_action(&ctx).await {
                        tracing::error!("Failed to start next action after completion: {}", e);
                    }
                }

                if container.should_finalize(&ctx) {
                    container
                        .finalize_task(&container.config, publisher.as_ref().ok(), &ctx)
                        .await;

                    // NOTE: We intentionally DO NOT auto-consume queued follow-ups or
                    // queued messages here. The "Queue For Next Turn" button has been
                    // removed in favor of the message queue with live injection.
                    // Messages are injected directly into running processes via the
                    // /inject-message endpoint and removed from queue on success.
                    // See: Sessions 2 & 3 of message-queue-injection fix plan.
                }
            }

            // Now that commit/next-action/finalization steps for this process are complete,
            // capture the HEAD OID as the definitive "after" state (best-effort).
            if let Ok(ctx) = ExecutionProcess::load_context(&db.pool, exec_id).await {
                let worktree_dir = container.task_attempt_to_current_dir(&ctx.task_attempt);
                if let Ok(head) = container.git().get_head_info(&worktree_dir)
                    && let Err(e) =
                        ExecutionProcess::update_after_head_commit(&db.pool, exec_id, &head.oid)
                            .await
                {
                    tracing::warn!("Failed to update after_head_commit for {}: {}", exec_id, e);
                }
            }

            // Flush any remaining buffered logs before signaling finished
            if let Some(log_batcher) = container.log_batcher() {
                log_batcher.finish(exec_id).await;
            }

            // Cancel pending approvals before removing the MsgStore so the background
            // timeout watchers see Denied (not TimedOut) and skip the MsgStore update.
            container.approvals.cancel_for_process(exec_id);

            // Signal the normalizer that no more log lines are coming, then await completion.
            // push_finished() MUST come before awaiting the normalization handle: the normalizer's
            // stdout_lines_stream() blocks indefinitely until push_finished() closes the channel,
            // so waiting first causes a guaranteed deadlock that always fires the timeout.
            let msg_arc = msg_stores.write().await.remove(&exec_id);
            if let Some(ref arc) = msg_arc {
                arc.push_finished();
            }

            let timeout_secs = normalization_timeout_secs();
            if let Some(norm_handle) = container.take_normalization_handle(&exec_id).await {
                let span = tracing::info_span!(
                    "normalization_await",
                    exec_id = %exec_id,
                    timeout_secs = timeout_secs
                );
                let _guard = span.enter();

                let start = std::time::Instant::now();
                let result =
                    tokio::time::timeout(Duration::from_secs(timeout_secs), norm_handle).await;

                match result {
                    Ok(_) => {
                        let duration = start.elapsed();
                        container
                            .normalization_metrics()
                            .record_completion(duration);
                        tracing::debug!(
                            exec_id = %exec_id,
                            duration_ms = duration.as_millis() as u64,
                            "Normalization completed"
                        );
                    }
                    Err(_) => {
                        container.normalization_metrics().record_timeout();
                        tracing::warn!(
                            exec_id = %exec_id,
                            timeout_secs = timeout_secs,
                            "Normalization timed out. Raw logs preserved in execution_process_logs."
                        );
                    }
                }
            }

            // Drop the MsgStore; after normalization completes all internal clones are released
            if let Some(arc) = msg_arc {
                match Arc::try_unwrap(arc) {
                    Ok(inner) => drop(inner),
                    Err(arc) => tracing::error!(
                        "There are still {} strong Arcs to MsgStore for {}",
                        Arc::strong_count(&arc),
                        exec_id
                    ),
                }
            }

            // Cleanup child handle, protocol peer, and entry index provider
            child_store.write().await.remove(&exec_id);
            container.remove_protocol_peer(&exec_id).await;
            container.remove_entry_index_provider(&exec_id).await;
        })
    }

    pub fn spawn_os_exit_watcher(
        &self,
        exec_id: Uuid,
    ) -> tokio::sync::oneshot::Receiver<std::io::Result<std::process::ExitStatus>> {
        let (tx, rx) = tokio::sync::oneshot::channel::<std::io::Result<std::process::ExitStatus>>();
        let child_store = self.child_store.clone();
        tokio::spawn(async move {
            loop {
                let child_lock = {
                    let map = child_store.read().await;
                    map.get(&exec_id).cloned()
                };
                if let Some(child_lock) = child_lock {
                    let mut child_handler = child_lock.write().await;
                    match child_handler.try_wait() {
                        Ok(Some(status)) => {
                            let _ = tx.send(Ok(status));
                            break;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            let _ = tx.send(Err(e));
                            break;
                        }
                    }
                } else {
                    let _ = tx.send(Err(io::Error::other(format!(
                        "Child handle missing for {exec_id}"
                    ))));
                    break;
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        });
        rx
    }

    pub fn dir_name_from_task_attempt(attempt_id: &Uuid, task_title: &str) -> String {
        let task_title_id = git_branch_id(task_title);
        format!("{}-{}", short_uuid(attempt_id), task_title_id)
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

    /// Create a diff log stream for merged attempts (never changes) for WebSocket
    fn create_merged_diff_stream(
        &self,
        project_repo_path: &Path,
        merge_commit_id: &str,
        stats_only: bool,
    ) -> Result<DiffStreamHandle, ContainerError> {
        let diffs = self.git().get_diffs(
            DiffTarget::Commit {
                repo_path: project_repo_path,
                commit_sha: merge_commit_id,
            },
            None,
        )?;

        let cum = Arc::new(AtomicUsize::new(0));
        let diffs: Vec<_> = diffs
            .into_iter()
            .map(|mut d| {
                diff_stream::apply_stream_omit_policy(&mut d, &cum, stats_only);
                d
            })
            .collect();

        let stream = futures::stream::iter(diffs.into_iter().map(|diff| {
            let entry_index = GitService::diff_path(&diff);
            let patch =
                ConversationPatch::add_diff(escape_json_pointer_segment(&entry_index), diff);
            Ok::<_, std::io::Error>(LogMsg::JsonPatch(patch))
        }))
        .chain(futures::stream::once(async {
            Ok::<_, std::io::Error>(LogMsg::Finished)
        }))
        .boxed();

        Ok(diff_stream::DiffStreamHandle::new(stream, None))
    }

    /// Create a live diff log stream for ongoing attempts for WebSocket
    /// Returns a stream that owns the filesystem watcher - when dropped, watcher is cleaned up
    async fn create_live_diff_stream(
        &self,
        worktree_path: &Path,
        base_commit: &Commit,
        stats_only: bool,
    ) -> Result<DiffStreamHandle, ContainerError> {
        diff_stream::create(
            self.git().clone(),
            worktree_path.to_path_buf(),
            base_commit.clone(),
            stats_only,
        )
        .await
        .map_err(|e| ContainerError::Other(anyhow!("{e}")))
    }

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
                if let Some((_, entry)) = extract_normalized_entry_from_patch(patch)
                    && matches!(entry.entry_type, NormalizedEntryType::AssistantMessage)
                {
                    let content = entry.content.trim();
                    if !content.is_empty() {
                        const MAX_SUMMARY_LENGTH: usize = 4096;
                        if content.len() > MAX_SUMMARY_LENGTH {
                            let truncated = truncate_to_char_boundary(content, MAX_SUMMARY_LENGTH);
                            return Some(format!("{truncated}..."));
                        }
                        return Some(content.to_string());
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

    /// If a queued follow-up draft exists for this attempt and nothing is running,
    /// start it immediately and clear the draft.
    ///
    /// NOTE: This function is currently unused. The "Queue For Next Turn" UI was removed
    /// in favor of the message queue with live injection. Keeping this for potential
    /// future use or manual triggering via API.
    #[allow(dead_code)]
    async fn try_consume_queued_followup(
        &self,
        ctx: &ExecutionContext,
    ) -> Result<(), ContainerError> {
        // Only consider CodingAgent/cleanup chains; skip DevServer completions
        if matches!(
            ctx.execution_process.run_reason,
            ExecutionProcessRunReason::DevServer
        ) {
            return Ok(());
        }

        // If anything is running for this attempt, bail
        let procs =
            ExecutionProcess::find_by_task_attempt_id(&self.db.pool, ctx.task_attempt.id, false)
                .await?;
        if procs
            .iter()
            .any(|p| matches!(p.status, ExecutionProcessStatus::Running))
        {
            return Ok(());
        }

        // Load draft and ensure it's eligible
        let Some(draft) = Draft::find_by_task_attempt_and_type(
            &self.db.pool,
            ctx.task_attempt.id,
            DraftType::FollowUp,
        )
        .await?
        else {
            return Ok(());
        };

        if !draft.queued || draft.prompt.trim().is_empty() {
            return Ok(());
        }

        // Atomically acquire sending lock; if not acquired, someone else is sending.
        if !Draft::try_mark_sending(&self.db.pool, ctx.task_attempt.id, DraftType::FollowUp)
            .await
            .unwrap_or(false)
        {
            return Ok(());
        }

        // Ensure worktree exists
        let container_ref = self.ensure_container_exists(&ctx.task_attempt).await?;

        // Get session id - use find_previous_session_ids to skip invalidated sessions
        // This automatically filters out sessions with NULL session_id (marked invalid after failure)
        let session_ids =
            ExecutionProcess::find_previous_session_ids(&self.db.pool, ctx.task_attempt.id, 5)
                .await?;

        let Some(session_id) = session_ids.into_iter().next() else {
            tracing::warn!(
                "No valid session id found for attempt {}. Cannot start queued follow-up.",
                ctx.task_attempt.id
            );
            return Ok(());
        };

        // Get last coding agent process to inherit executor profile
        let Some(latest) = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
            &self.db.pool,
            ctx.task_attempt.id,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?
        else {
            tracing::warn!(
                "No prior CodingAgent process for attempt {}. Cannot start queued follow-up.",
                ctx.task_attempt.id
            );
            return Ok(());
        };

        use executors::actions::ExecutorActionType;
        let initial_executor_profile_id = match &latest.executor_action()?.typ {
            ExecutorActionType::CodingAgentInitialRequest(req) => req.executor_profile_id.clone(),
            ExecutorActionType::CodingAgentFollowUpRequest(req) => req.executor_profile_id.clone(),
            _ => {
                tracing::warn!(
                    "Latest process for attempt {} is not a coding agent; skipping queued follow-up",
                    ctx.task_attempt.id
                );
                return Ok(());
            }
        };

        let executor_profile_id = executors::profile::ExecutorProfileId {
            executor: initial_executor_profile_id.executor,
            variant: draft.variant.clone(),
        };

        // Prepare cleanup action
        let cleanup_action = ctx
            .task
            .parent_project(&self.db.pool)
            .await?
            .and_then(|project| self.cleanup_action(project.cleanup_script));

        // Handle images: associate, copy to worktree, canonicalize prompt
        let mut prompt = draft.prompt.clone();
        if let Some(image_ids) = &draft.image_ids {
            // Associate to task
            let _ = TaskImage::associate_many_dedup(&self.db.pool, ctx.task.id, image_ids).await;

            // Copy to worktree and canonicalize
            let worktree_path = std::path::PathBuf::from(&container_ref);
            if let Err(e) = self
                .image_service
                .copy_images_by_ids_to_worktree(&worktree_path, image_ids)
                .await
            {
                tracing::warn!("Failed to copy images to worktree: {}", e);
            } else {
                prompt = ImageService::canonicalise_image_paths(&prompt, &worktree_path);
            }
        }

        let follow_up_request =
            executors::actions::coding_agent_follow_up::CodingAgentFollowUpRequest {
                prompt,
                session_id,
                executor_profile_id,
            };

        let follow_up_action = executors::actions::ExecutorAction::new(
            executors::actions::ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
            cleanup_action,
        );

        // Start the execution
        let _ = self
            .start_execution(
                &ctx.task_attempt,
                &follow_up_action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?;

        // Clear the draft to reflect that it has been consumed
        let _ =
            Draft::clear_after_send(&self.db.pool, ctx.task_attempt.id, DraftType::FollowUp).await;

        Ok(())
    }

    /// If a queued message exists in the in-memory queue for this attempt and nothing is running,
    /// pop and start it as a follow-up request.
    ///
    /// NOTE: This function is currently unused. Messages are now injected directly into
    /// running processes via the /inject-message endpoint and removed from queue on success.
    /// Keeping this for potential future use or manual triggering via API.
    #[allow(dead_code)]
    async fn try_consume_queued_message(
        &self,
        ctx: &ExecutionContext,
    ) -> Result<(), ContainerError> {
        // Only consider CodingAgent chains; skip DevServer completions
        if matches!(
            ctx.execution_process.run_reason,
            ExecutionProcessRunReason::DevServer
        ) {
            return Ok(());
        }

        // If anything is running for this attempt, bail
        let procs =
            ExecutionProcess::find_by_task_attempt_id(&self.db.pool, ctx.task_attempt.id, false)
                .await?;
        if procs
            .iter()
            .any(|p| matches!(p.status, ExecutionProcessStatus::Running))
        {
            return Ok(());
        }

        // Pop the next message from the queue
        let Some(queued_msg) = self.message_queue.pop_next(ctx.task_attempt.id).await else {
            return Ok(());
        };

        tracing::info!(
            task_attempt_id = %ctx.task_attempt.id,
            message_id = %queued_msg.id,
            "Consuming queued message to start follow-up"
        );

        // Ensure worktree exists
        let container_ref = self.ensure_container_exists(&ctx.task_attempt).await?;

        // Get session id - use find_previous_session_ids to skip invalidated sessions
        let session_ids =
            ExecutionProcess::find_previous_session_ids(&self.db.pool, ctx.task_attempt.id, 5)
                .await?;

        let Some(session_id) = session_ids.into_iter().next() else {
            tracing::warn!(
                "No valid session id found for attempt {}. Cannot start queued message.",
                ctx.task_attempt.id
            );
            return Ok(());
        };

        // Get last coding agent process to inherit executor profile
        let Some(latest) = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
            &self.db.pool,
            ctx.task_attempt.id,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?
        else {
            tracing::warn!(
                "No prior CodingAgent process for attempt {}. Cannot start queued message.",
                ctx.task_attempt.id
            );
            return Ok(());
        };

        use executors::actions::ExecutorActionType;
        let initial_executor_profile_id = match &latest.executor_action()?.typ {
            ExecutorActionType::CodingAgentInitialRequest(req) => req.executor_profile_id.clone(),
            ExecutorActionType::CodingAgentFollowUpRequest(req) => req.executor_profile_id.clone(),
            _ => {
                tracing::warn!(
                    "Latest process for attempt {} is not a coding agent; skipping queued message",
                    ctx.task_attempt.id
                );
                return Ok(());
            }
        };

        let executor_profile_id = executors::profile::ExecutorProfileId {
            executor: initial_executor_profile_id.executor,
            variant: queued_msg.variant.clone(),
        };

        // Prepare cleanup action
        let cleanup_action = ctx
            .task
            .parent_project(&self.db.pool)
            .await?
            .and_then(|project| self.cleanup_action(project.cleanup_script));

        // Handle images: copy to worktree and canonicalize prompt
        let worktree_path = std::path::PathBuf::from(&container_ref);
        let prompt = ImageService::canonicalise_image_paths(&queued_msg.content, &worktree_path);

        let follow_up_request =
            executors::actions::coding_agent_follow_up::CodingAgentFollowUpRequest {
                prompt,
                session_id,
                executor_profile_id,
            };

        let follow_up_action = executors::actions::ExecutorAction::new(
            executors::actions::ExecutorActionType::CodingAgentFollowUpRequest(follow_up_request),
            cleanup_action,
        );

        // Start the execution
        let _ = self
            .start_execution(
                &ctx.task_attempt,
                &follow_up_action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?;

        Ok(())
    }

    /// Create a .env file in the worktree with auto-assigned ports
    async fn create_worktree_env(&self, worktree_path: &Path) -> std::io::Result<()> {
        use std::net::TcpListener;

        // Find three available ports for frontend, backend, and MCP
        let frontend_port = TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port();
        let backend_port = TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port();
        let mcp_port = TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port();

        // Build the .env content
        let env_content = format!(
            r#"# Auto-generated .env for worktree
# These ports are automatically assigned to avoid conflicts

# Development Server Ports
FRONTEND_PORT={}
BACKEND_PORT={}
MCP_PORT={}

# Database Configuration
# Use the worktree's local dev_assets for isolation
VK_DATABASE_PATH=./dev_assets/db.sqlite

# Network Configuration
HOST=127.0.0.1

# Logging
RUST_LOG=info
"#,
            frontend_port, backend_port, mcp_port
        );

        let env_path = worktree_path.join(".env");
        tokio::fs::write(&env_path, env_content).await?;

        tracing::info!(
            worktree = %worktree_path.display(),
            frontend_port = frontend_port,
            backend_port = backend_port,
            mcp_port = mcp_port,
            "Created worktree .env file with auto-assigned ports"
        );

        Ok(())
    }
}

fn failure_exit_status() -> std::process::ExitStatus {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        ExitStatusExt::from_raw(256) // Exit code 1 (shifted by 8 bits)
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::ExitStatusExt;
        ExitStatusExt::from_raw(1)
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

    fn share_publisher(&self) -> Option<&SharePublisher> {
        self.publisher.as_ref().ok()
    }

    fn log_batcher(&self) -> Option<&LogBatcherHandle> {
        Some(&self.log_batcher)
    }

    fn normalization_metrics(&self) -> &NormalizationMetrics {
        &self.normalization_metrics
    }

    async fn store_normalization_handle(&self, exec_id: Uuid, handle: JoinHandle<()>) {
        self.store_normalization_handle(exec_id, handle).await;
    }

    async fn take_normalization_handle(&self, exec_id: &Uuid) -> Option<JoinHandle<()>> {
        self.take_normalization_handle(exec_id).await
    }

    async fn get_entry_index_provider(&self, exec_id: &Uuid) -> Option<EntryIndexProvider> {
        self.get_entry_index_provider(exec_id).await
    }

    async fn store_entry_index_provider(&self, exec_id: Uuid, provider: EntryIndexProvider) {
        self.store_entry_index_provider(exec_id, provider).await
    }

    fn instance_id(&self) -> &str {
        &self.instance_id
    }

    async fn git_branch_prefix(&self) -> String {
        self.config.read().await.git_branch_prefix.clone()
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

        let project = task
            .parent_project(&self.db.pool)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Register container_ref BEFORE creating the directory on disk so that
        // `cleanup_orphaned_worktrees` never sees the directory without a matching DB row (RC-1).
        TaskAttempt::update_container_ref(
            &self.db.pool,
            task_attempt.id,
            &worktree_path.to_string_lossy(),
        )
        .await?;

        // Create the worktree on disk. On failure, clear the DB reservation so the row
        // doesn't look like a live path to cleanup code.
        if let Err(e) = WorktreeManager::create_worktree(
            &project.git_repo_path,
            &task_attempt.branch,
            &worktree_path,
            &task_attempt.target_branch,
            true, // create new branch
        )
        .await
        {
            if let Err(clear_err) =
                TaskAttempt::clear_container_ref(&self.db.pool, task_attempt.id).await
            {
                tracing::warn!(
                    attempt_id = %task_attempt.id,
                    error = %clear_err,
                    "Failed to clear container_ref after worktree creation failure"
                );
            }
            return Err(ContainerError::Other(anyhow!("{e}")));
        }

        // The following setup steps are best-effort: failures are logged as warnings but do
        // NOT trigger rollback. The worktree directory exists and the DB row is registered,
        // so the attempt is considered created. Rollback (clear_container_ref + disk cleanup)
        // only applies to the create_worktree step above.

        // Create .env file with auto-assigned ports for this worktree
        if let Err(e) = self.create_worktree_env(&worktree_path).await {
            tracing::warn!("Failed to create worktree .env file: {}", e);
        }

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
        WorktreeManager::cleanup_worktree(&WorktreeCleanup::new(
            PathBuf::from(task_attempt.container_ref.clone().unwrap_or_default()),
            git_repo_path,
        ))
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

        WorktreeManager::ensure_worktree_exists(
            &project.git_repo_path,
            &task_attempt.branch,
            &worktree_path,
        )
        .await?;

        // Unconditionally reset worktree_deleted: the flag may have been set incorrectly
        // during the creation-window race (RC-3). Always resetting is idempotent and safe.
        if let Err(e) = TaskAttempt::reset_worktree_deleted(&self.db.pool, task_attempt.id).await {
            tracing::warn!(
                attempt_id = %task_attempt.id,
                error = %e,
                "Failed to reset worktree_deleted flag after successful ensure"
            );
        }

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

        let approvals_service: Arc<dyn ExecutorApprovalService> =
            match executor_action.base_executor() {
                Some(BaseCodingAgent::Codex) | Some(BaseCodingAgent::ClaudeCode) => {
                    ExecutorApprovalBridge::new(
                        self.approvals.clone(),
                        self.db.clone(),
                        execution_process.id,
                    )
                }
                _ => Arc::new(NoopExecutorApprovalService {}),
            };

        // Create SpawnContext with IDs from task_attempt and execution_process
        let spawn_context = SpawnContext {
            task_attempt_id: task_attempt.id,
            task_id: task_attempt.task_id,
            execution_process_id: execution_process.id,
        };

        // Create the child and stream, add to execution tracker with timeout
        let mut spawned = tokio::time::timeout(
            Duration::from_secs(30),
            executor_action.spawn(&current_dir, approvals_service, spawn_context),
        )
        .await
        .map_err(|_| {
            ContainerError::Other(anyhow!(
                "Timeout: process took more than 30 seconds to start"
            ))
        })??;

        // Extract and store the PID for process tree discovery
        if let Some(pid) = spawned.child.inner().id() {
            tracing::debug!(
                execution_process_id = %execution_process.id,
                pid = pid,
                "Storing PID for execution process"
            );
            if let Err(e) =
                ExecutionProcess::update_pid(&self.db.pool, execution_process.id, pid as i64).await
            {
                tracing::warn!(
                    execution_process_id = %execution_process.id,
                    error = %e,
                    "Failed to store PID for execution process"
                );
            }
        }

        self.track_child_msgs_in_store(execution_process.id, &mut spawned.child)
            .await;

        self.add_child_to_store(execution_process.id, spawned.child)
            .await;

        // Store protocol peer for message injection (Claude Code only)
        if let Some(peer) = spawned.protocol_peer {
            tracing::debug!(
                execution_process_id = %execution_process.id,
                "Storing protocol peer for message injection"
            );
            self.store_protocol_peer(execution_process.id, peer).await;
        }

        // Spawn unified exit monitor: watches OS exit and optional executor signal
        let _hn = self.spawn_exit_monitor(&execution_process.id, spawned.exit_signal);

        Ok(())
    }

    async fn stop_execution(
        &self,
        execution_process: &ExecutionProcess,
        status: ExecutionProcessStatus,
    ) -> Result<(), ContainerError> {
        let child = self
            .get_child_from_store(&execution_process.id)
            .await
            .ok_or_else(|| {
                ContainerError::Other(anyhow!("Child process not found for execution"))
            })?;
        let exit_code = if status == ExecutionProcessStatus::Completed {
            Some(0)
        } else {
            None
        };

        // User manually stopped the execution
        let completion_reason = if status == ExecutionProcessStatus::Killed {
            Some("killed")
        } else {
            None
        };

        ExecutionProcess::update_completion(
            &self.db.pool,
            execution_process.id,
            status,
            exit_code,
            completion_reason,
            None, // No completion message for manual stops
        )
        .await?;

        // Ask the agent to interrupt first if it supports a protocol-native stop.
        // We still fall back to killing the process group below.
        if let Some(peer) = self.get_protocol_peer(&execution_process.id).await {
            match peer.interrupt().await {
                Ok(true) => {
                    tracing::debug!(
                        execution_process_id = %execution_process.id,
                        "Sent protocol interrupt before process termination"
                    );
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                Ok(false) => {
                    tracing::trace!(
                        execution_process_id = %execution_process.id,
                        "Protocol peer does not support interrupt"
                    );
                }
                Err(err) => {
                    tracing::warn!(
                        execution_process_id = %execution_process.id,
                        error = %err,
                        "Protocol interrupt failed; falling back to process termination"
                    );
                }
            }
        }

        // Kill the child process and remove from the store
        const LOCK_TIMEOUT: Duration = Duration::from_secs(5);
        {
            let child_guard = match tokio::time::timeout(LOCK_TIMEOUT, child.write()).await {
                Ok(guard) => guard,
                Err(_) => {
                    tracing::warn!(
                        execution_process_id = %execution_process.id,
                        timeout_secs = LOCK_TIMEOUT.as_secs(),
                        "stop_execution: child lock acquisition timed out"
                    );
                    return Err(ContainerError::Other(anyhow!(
                        "Failed to acquire child lock within {}s",
                        LOCK_TIMEOUT.as_secs()
                    )));
                }
            };
            let mut child_guard = child_guard;
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
        self.remove_protocol_peer(&execution_process.id).await;
        self.remove_entry_index_provider(&execution_process.id)
            .await;

        // Flush any remaining buffered logs before signaling finished
        if let Some(log_batcher) = self.log_batcher() {
            log_batcher.finish(execution_process.id).await;
        }

        // Cancel pending approvals before removing the MsgStore so the background
        // timeout watchers see Denied (not TimedOut) and skip the MsgStore update.
        self.approvals.cancel_for_process(execution_process.id);

        // Signal the normalizer that no more log lines are coming, then await completion.
        // push_finished() MUST come before awaiting the normalization handle: the normalizer's
        // stdout_lines_stream() blocks indefinitely until push_finished() closes the channel,
        // so waiting first causes a guaranteed deadlock that always fires the timeout.
        if let Some(msg) = self.msg_stores.write().await.remove(&execution_process.id) {
            msg.push_finished();
        }

        let timeout_secs = normalization_timeout_secs();
        if let Some(norm_handle) = self.take_normalization_handle(&execution_process.id).await {
            let span = tracing::info_span!(
                "normalization_await",
                exec_id = %execution_process.id,
                timeout_secs = timeout_secs
            );
            let _guard = span.enter();

            let start = std::time::Instant::now();
            let result = tokio::time::timeout(Duration::from_secs(timeout_secs), norm_handle).await;

            match result {
                Ok(_) => {
                    let duration = start.elapsed();
                    self.normalization_metrics.record_completion(duration);
                    tracing::debug!(
                        exec_id = %execution_process.id,
                        duration_ms = duration.as_millis() as u64,
                        "Normalization completed"
                    );
                }
                Err(_) => {
                    self.normalization_metrics.record_timeout();
                    tracing::warn!(
                        execution_process_id = %execution_process.id,
                        timeout_secs = timeout_secs,
                        "Normalization timed out. Raw logs preserved in execution_process_logs."
                    );
                }
            }
        }

        // Run normalization to populate log_entries with JsonPatch entries for REST pagination
        if let Err(e) =
            log_migration::migrate_execution_logs(&self.db.pool, execution_process.id).await
        {
            tracing::warn!(
                execution_process_id = %execution_process.id,
                error = %e,
                "Failed to normalize logs for stopped execution"
            );
        }

        // Update task status to InReview when execution is stopped
        if let Ok(ctx) = ExecutionProcess::load_context(&self.db.pool, execution_process.id).await
            && !matches!(
                ctx.execution_process.run_reason,
                ExecutionProcessRunReason::DevServer
            )
        {
            match Task::update_status(&self.db.pool, ctx.task.id, TaskStatus::InReview).await {
                Ok(_) => {
                    if let Some(publisher) = self.share_publisher()
                        && let Err(err) = publisher.update_shared_task_by_id(ctx.task.id).await
                    {
                        tracing::warn!(
                            ?err,
                            "Failed to propagate shared task update for {}",
                            ctx.task.id
                        );
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to update task status to InReview: {e}");
                }
            }
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

    async fn stream_diff(
        &self,
        task_attempt: &TaskAttempt,
        stats_only: bool,
    ) -> Result<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>, ContainerError>
    {
        let project_repo_path = self.get_project_repo_path(task_attempt).await?;
        let latest_merge =
            Merge::find_latest_by_task_attempt_id(&self.db.pool, task_attempt.id).await?;

        let is_ahead = if let Ok((ahead, _)) = self.git().get_branch_status(
            &project_repo_path,
            &task_attempt.branch,
            &task_attempt.target_branch,
        ) {
            ahead > 0
        } else {
            false
        };

        if let Some(merge) = &latest_merge
            && let Some(commit) = merge.merge_commit()
            && self.is_container_clean(task_attempt).await?
            && !is_ahead
        {
            let wrapper =
                self.create_merged_diff_stream(&project_repo_path, &commit, stats_only)?;
            return Ok(Box::pin(wrapper));
        }

        let container_ref = self.ensure_container_exists(task_attempt).await?;
        let worktree_path = PathBuf::from(container_ref);
        let base_commit = self.git().get_base_commit(
            &project_repo_path,
            &task_attempt.branch,
            &task_attempt.target_branch,
        )?;

        let wrapper = self
            .create_live_diff_stream(&worktree_path, &base_commit, stats_only)
            .await?;
        Ok(Box::pin(wrapper))
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
                    ContainerError::Other(anyhow!("Failed to create directory {parent:?}: {e}"))
                })?;
            }

            // Copy the file
            if source_file.exists() {
                std::fs::copy(&source_file, &target_file).map_err(|e| {
                    ContainerError::Other(anyhow!(
                        "Failed to copy file {source_file:?} to {target_file:?}: {e}"
                    ))
                })?;
                tracing::info!("Copied file {:?} to worktree", file_path);
            } else {
                return Err(ContainerError::Other(anyhow!(
                    "File {source_file:?} does not exist in the project directory"
                )));
            }
        }
        Ok(())
    }

    async fn inject_message(
        &self,
        execution_process_id: Uuid,
        message: String,
    ) -> Result<bool, ContainerError> {
        // Get the protocol peer for this execution
        if let Some(peer) = self.get_protocol_peer(&execution_process_id).await {
            tracing::debug!(
                execution_process_id = %execution_process_id,
                message_len = message.len(),
                "Injecting message into running agent process"
            );

            // Emit log entry BEFORE injecting to stdin so the injected message
            // appears in the executor logs / conversation UI
            if let Ok(msg_stores) = self.msg_stores.try_read()
                && let Some(msg_store) = msg_stores.get(&execution_process_id)
            {
                // Get or create entry index provider for this execution
                let index_provider = self
                    .get_entry_index_provider(&execution_process_id)
                    .await
                    .unwrap_or_else(|| {
                        tracing::warn!(
                            execution_process_id = %execution_process_id,
                            "Entry index provider not found, creating fallback"
                        );
                        EntryIndexProvider::start_from(msg_store)
                    });

                let entry = NormalizedEntry {
                    timestamp: Some(Utc::now().to_rfc3339()),
                    entry_type: NormalizedEntryType::UserMessage,
                    content: message.clone(),
                    metadata: Some(serde_json::json!({"injected": true})),
                };
                let index = index_provider.next();
                msg_store.push_patch(ConversationPatch::add_normalized_entry(index, entry));
                tracing::debug!(
                    execution_process_id = %execution_process_id,
                    entry_index = index,
                    "Emitted log entry for injected message"
                );
            }

            peer.send_user_message(message)
                .await
                .map_err(|e| ContainerError::Other(anyhow!("Failed to inject message: {}", e)))?;
            Ok(true)
        } else {
            tracing::debug!(
                execution_process_id = %execution_process_id,
                "No protocol peer found for message injection"
            );
            Ok(false)
        }
    }

    async fn kill_all_running_processes(&self) -> Result<(), ContainerError> {
        // Only kill processes that belong to THIS server instance.
        // This prevents cargo watch restarts from killing processes started by other instances.
        tracing::info!(
            instance_id = %self.instance_id,
            "Killing running processes for this instance"
        );
        let running_processes =
            ExecutionProcess::find_running_by_instance(&self.db.pool, &self.instance_id).await?;

        if running_processes.is_empty() {
            tracing::info!(
                instance_id = %self.instance_id,
                "No running processes to kill for this instance"
            );
        } else {
            tracing::info!(
                instance_id = %self.instance_id,
                count = running_processes.len(),
                "Found {} running processes to kill for this instance",
                running_processes.len()
            );
        }

        for process in running_processes {
            if let Err(error) = self
                .stop_execution(&process, ExecutionProcessStatus::Killed)
                .await
            {
                tracing::error!(
                    "Failed to cleanly kill running execution process {:?}: {:?}",
                    process,
                    error
                );
            }
        }

        Ok(())
    }
}

fn success_exit_status() -> std::process::ExitStatus {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        ExitStatusExt::from_raw(0)
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::ExitStatusExt;
        ExitStatusExt::from_raw(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    /// Helper to safely set an environment variable in tests.
    ///
    /// # Safety
    /// This is safe when tests are run with `--test-threads=1`.
    unsafe fn set_env(key: &str, value: &str) {
        // SAFETY: The caller guarantees single-threaded execution.
        unsafe { std::env::set_var(key, value) };
    }

    /// Helper to safely remove an environment variable in tests.
    ///
    /// # Safety
    /// This is safe when tests are run with `--test-threads=1`.
    unsafe fn remove_env(key: &str) {
        // SAFETY: The caller guarantees single-threaded execution.
        unsafe { std::env::remove_var(key) };
    }

    #[test]
    #[serial]
    fn test_normalization_timeout_default() {
        // Save original value if any
        let original = std::env::var("VK_NORMALIZATION_TIMEOUT_SECS").ok();

        // SAFETY: We're modifying env vars in a controlled test environment.
        unsafe {
            remove_env("VK_NORMALIZATION_TIMEOUT_SECS");
        }

        let timeout = normalization_timeout_secs();
        assert_eq!(
            timeout, 5,
            "Should use default of 5 seconds when env var not set"
        );

        // Restore original value
        // SAFETY: Same as above
        unsafe {
            if let Some(val) = original {
                set_env("VK_NORMALIZATION_TIMEOUT_SECS", &val);
            }
        }
    }

    #[test]
    #[serial]
    fn test_normalization_timeout_custom() {
        // Save original value if any
        let original = std::env::var("VK_NORMALIZATION_TIMEOUT_SECS").ok();

        // SAFETY: We're modifying env vars in a controlled test environment.
        unsafe {
            set_env("VK_NORMALIZATION_TIMEOUT_SECS", "10");
        }

        let timeout = normalization_timeout_secs();
        assert_eq!(
            timeout, 10,
            "Should use value from VK_NORMALIZATION_TIMEOUT_SECS"
        );

        // Restore original value
        // SAFETY: Same as above
        unsafe {
            match original {
                Some(val) => set_env("VK_NORMALIZATION_TIMEOUT_SECS", &val),
                None => remove_env("VK_NORMALIZATION_TIMEOUT_SECS"),
            }
        }
    }

    #[test]
    #[serial]
    fn test_normalization_timeout_invalid_falls_back_to_default() {
        // Save original value if any
        let original = std::env::var("VK_NORMALIZATION_TIMEOUT_SECS").ok();

        // SAFETY: We're modifying env vars in a controlled test environment.
        unsafe {
            set_env("VK_NORMALIZATION_TIMEOUT_SECS", "not_a_number");
        }

        let timeout = normalization_timeout_secs();
        assert_eq!(
            timeout, 5,
            "Should use default when env var is not a valid number"
        );

        // Restore original value
        // SAFETY: Same as above
        unsafe {
            match original {
                Some(val) => set_env("VK_NORMALIZATION_TIMEOUT_SECS", &val),
                None => remove_env("VK_NORMALIZATION_TIMEOUT_SECS"),
            }
        }
    }
}
