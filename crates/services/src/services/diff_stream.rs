use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, SystemTime},
};

use db::{
    DBService,
    models::{workspace::Workspace, workspace_repo::WorkspaceRepo},
};
use executors::logs::utils::ConversationPatch;
use futures::StreamExt;
use git::{Commit, GitService, GitServiceError, compute_line_change_counts};
use json_patch::Patch;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    DebounceEventResult, DebouncedEvent, Debouncer, RecommendedCache, new_debouncer,
};
use sqlx::SqlitePool;
use thiserror::Error;
use tokio::{sync::mpsc, task::JoinHandle};
use tokio_stream::wrappers::{IntervalStream, ReceiverStream};
use utils::{diff::Diff, log_msg::LogMsg};
use uuid::Uuid;

use crate::services::filesystem_watcher::{self, FilesystemWatcherError};

type SentFileStats = Arc<std::sync::RwLock<HashMap<String, (SystemTime, u64)>>>;

#[derive(Debug, Clone, Default)]
pub struct DiffStats {
    pub files_changed: usize,
    pub lines_added: usize,
    pub lines_removed: usize,
}

/// Computes diff stats for a workspace by comparing against target branches.
pub async fn compute_diff_stats(
    pool: &SqlitePool,
    git: &GitService,
    workspace: &Workspace,
) -> Option<DiffStats> {
    let container_ref = workspace.container_ref.as_ref()?;

    let workspace_repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id)
            .await
            .ok()?;

    let mut stats = DiffStats::default();

    for repo_with_branch in workspace_repos {
        let worktree_path = PathBuf::from(container_ref).join(&repo_with_branch.repo.name);
        let repo_path = repo_with_branch.repo.path.clone();

        let base_commit_result = tokio::task::spawn_blocking({
            let git = git.clone();
            let repo_path = repo_path.clone();
            let workspace_branch = workspace.branch.clone();
            let target_branch = repo_with_branch.target_branch.clone();
            move || git.get_base_commit(&repo_path, &workspace_branch, &target_branch)
        })
        .await;

        let base_commit = match base_commit_result {
            Ok(Ok(commit)) => commit,
            _ => continue,
        };

        let diffs_result = tokio::task::spawn_blocking({
            let git = git.clone();
            let worktree = worktree_path.clone();
            move || git.get_diffs(&worktree, &base_commit, None)
        })
        .await;

        if let Ok(Ok(diffs)) = diffs_result {
            for diff in diffs {
                stats.files_changed += 1;
                stats.lines_added += diff.additions.unwrap_or(0);
                stats.lines_removed += diff.deletions.unwrap_or(0);
            }
        }
    }

    Some(stats)
}

/// Maximum cumulative diff bytes to stream before omitting content (200MB)
pub const MAX_CUMULATIVE_DIFF_BYTES: usize = 200 * 1024 * 1024;

const DIFF_STREAM_CHANNEL_CAPACITY: usize = 1000;

/// Errors that can occur during diff stream creation and operation
#[derive(Error, Debug)]
pub enum DiffStreamError {
    #[error("Git service error: {0}")]
    GitService(#[from] GitServiceError),
    #[error("Filesystem watcher error: {0}")]
    FilesystemWatcher(#[from] FilesystemWatcherError),
    #[error("Task join error: {0}")]
    TaskJoin(#[from] tokio::task::JoinError),
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("Notify error: {0}")]
    Notify(#[from] notify::Error),
}

/// Diff stream that owns the filesystem watcher task.
/// When this stream is dropped, the watcher is automatically cleaned up.
pub struct DiffStreamHandle {
    stream: futures::stream::BoxStream<'static, Result<LogMsg, io::Error>>,
    _watcher_task: Option<JoinHandle<()>>,
}

impl futures::Stream for DiffStreamHandle {
    type Item = Result<LogMsg, io::Error>;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        // Delegate to inner stream.
        std::pin::Pin::new(&mut self.stream).poll_next(cx)
    }
}

impl Drop for DiffStreamHandle {
    fn drop(&mut self) {
        if let Some(handle) = self._watcher_task.take() {
            handle.abort();
        }
    }
}

impl DiffStreamHandle {
    /// Create a new DiffStreamHandle from a boxed stream and optional watcher task.
    pub fn new(
        stream: futures::stream::BoxStream<'static, Result<LogMsg, io::Error>>,
        watcher_task: Option<JoinHandle<()>>,
    ) -> Self {
        Self {
            stream,
            _watcher_task: watcher_task,
        }
    }
}

#[derive(Clone)]
pub struct DiffStreamArgs {
    pub git_service: GitService,
    pub db: DBService,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub repo_path: PathBuf,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub target_branch: String,
    pub base_commit: Commit,
    pub stats_only: bool,
    pub path_prefix: Option<String>,
}

struct DiffStreamManager {
    args: DiffStreamArgs,
    tx: mpsc::Sender<Result<LogMsg, io::Error>>,
    cumulative: Arc<AtomicUsize>,
    known_paths: Arc<std::sync::RwLock<HashSet<String>>>,
    sent_file_stats: SentFileStats,
    current_base_commit: Commit,
    current_target_branch: String,
    last_head_commit: Option<Commit>,
    reconcile_cycle: u8,
    base_lookup_error_logged: bool,
    needs_post_reset_discovery: bool,
    pending_reset_since: Option<tokio::time::Instant>,
}

enum DiffEvent {
    Filesystem(DebounceEventResult),
    GitStateChange,
    CheckTarget,
    Reconcile,
    DebouncedReset,
}

pub async fn create(args: DiffStreamArgs) -> Result<DiffStreamHandle, DiffStreamError> {
    let (tx, rx) = mpsc::channel::<Result<LogMsg, io::Error>>(DIFF_STREAM_CHANNEL_CAPACITY);
    let manager_args = args.clone();

    let watcher_task = tokio::spawn(async move {
        let mut manager = DiffStreamManager::new(manager_args, tx);
        if let Err(e) = manager.run().await {
            tracing::warn!("Diff stream ended: {e}");
            let _ = manager.tx.send(Err(io::Error::other(e.to_string()))).await;
        }
    });

    Ok(DiffStreamHandle::new(
        ReceiverStream::new(rx).boxed(),
        Some(watcher_task),
    ))
}

impl DiffStreamManager {
    fn new(args: DiffStreamArgs, tx: mpsc::Sender<Result<LogMsg, io::Error>>) -> Self {
        Self {
            current_base_commit: args.base_commit.clone(),
            current_target_branch: args.target_branch.clone(),
            args,
            tx,
            cumulative: Arc::new(AtomicUsize::new(0)),
            known_paths: Arc::new(std::sync::RwLock::new(HashSet::new())),
            sent_file_stats: Arc::new(std::sync::RwLock::new(HashMap::new())),
            last_head_commit: None,
            reconcile_cycle: 0,
            base_lookup_error_logged: false,
            needs_post_reset_discovery: false,
            pending_reset_since: None,
        }
    }

    async fn run(&mut self) -> Result<(), DiffStreamError> {
        self.reset_stream().await?;
        self.last_head_commit = self.resolve_head_commit().await;
        // Send Ready once the initial snapshot has been pushed.
        let _ready_error = self.tx.send(Ok(LogMsg::Ready)).await;

        let (fs_debouncer, mut fs_rx, canonical_worktree) =
            filesystem_watcher::async_watcher(self.args.worktree_path.clone())
                .map_err(|e| io::Error::other(e.to_string()))?;
        let _fs_guard = fs_debouncer;

        let (git_debouncer, mut git_rx) =
            match setup_git_watcher(&self.args.git_service, &self.args.worktree_path) {
                Some((d, rx)) => (Some(d), Some(rx)),
                None => (None, None),
            };
        let _git_guard = git_debouncer;

        let mut target_interval =
            IntervalStream::new(tokio::time::interval(Duration::from_secs(1)));
        let mut reconcile_interval =
            IntervalStream::new(tokio::time::interval(Duration::from_secs(5)));

        loop {
            let event = tokio::select! {
                Some(res) = fs_rx.next() => DiffEvent::Filesystem(res),
                Ok(()) = async {
                    match git_rx.as_mut() {
                        Some(rx) => rx.changed().await,
                        None => std::future::pending().await,
                    }
                } => DiffEvent::GitStateChange,
                _ = target_interval.next() => DiffEvent::CheckTarget,
                _ = reconcile_interval.next() => DiffEvent::Reconcile,
                _ = async {
                    match self.pending_reset_since {
                        Some(since) => tokio::time::sleep_until(since + Duration::from_secs(1)).await,
                        None => std::future::pending().await,
                    }
                } => DiffEvent::DebouncedReset,
                else => break,
            };

            match event {
                DiffEvent::Filesystem(res) => match res {
                    Ok(events) => {
                        if let Err(e) = self.handle_fs_events(events, &canonical_worktree).await {
                            tracing::warn!(
                                "FS event processing failed, reconcile will catch up: {e}"
                            );
                        }
                    }
                    Err(e) => {
                        tracing::error!("Filesystem watcher error: {e:?}");
                        return Err(io::Error::other(format!("{e:?}")).into());
                    }
                },
                DiffEvent::GitStateChange => {
                    self.handle_git_state_change().await?;
                }
                DiffEvent::CheckTarget => {
                    self.handle_target_check().await?;
                }
                DiffEvent::Reconcile => {
                    if let Err(e) = self.handle_reconcile().await {
                        tracing::warn!("Reconcile failed: {e}");
                    }
                }
                DiffEvent::DebouncedReset => {
                    if let Some(new_base) = self
                        .recompute_base_commit(&self.current_target_branch)
                        .await
                    {
                        self.current_base_commit = new_base;
                    }
                    self.last_head_commit = self.resolve_head_commit().await;
                    self.reset_stream().await?;
                }
            }
        }
        Ok(())
    }

    async fn send_patch(&self, patch: Patch) -> Result<bool, DiffStreamError> {
        if patch.0.is_empty() {
            return Ok(true);
        }
        Ok(self.tx.send(Ok(LogMsg::JsonPatch(patch))).await.is_ok())
    }

    async fn reset_stream(&mut self) -> Result<(), DiffStreamError> {
        self.needs_post_reset_discovery = true;
        self.pending_reset_since = None;
        self.cumulative.store(0, Ordering::Relaxed);
        self.sent_file_stats.write().unwrap().clear();
        self.known_paths.write().unwrap().clear();

        let diffs = self.fetch_diffs().await?;
        let mut entries = HashMap::new();

        for mut diff in diffs {
            let raw_path = GitService::diff_path(&diff);
            self.known_paths.write().unwrap().insert(raw_path.clone());

            let abs = self.args.worktree_path.join(&raw_path);
            if let Ok(meta) = std::fs::metadata(&abs)
                && let Ok(mtime) = meta.modified()
            {
                self.sent_file_stats
                    .write()
                    .unwrap()
                    .insert(raw_path.clone(), (mtime, meta.len()));
            }

            if let Some(old) = diff.old_path {
                diff.old_path = Some(prefix_path(old, self.args.path_prefix.as_deref()));
            }
            if let Some(new) = diff.new_path {
                diff.new_path = Some(prefix_path(new, self.args.path_prefix.as_deref()));
            }
            diff.repo_id = Some(self.args.repo_id);

            entries.insert(raw_path, diff);
        }

        let repo_key = self.repo_key();
        let patch = ConversationPatch::replace_repo_diffs(&repo_key, entries);
        self.send_patch(patch).await?;

        Ok(())
    }

    async fn fetch_diffs(&self) -> Result<Vec<Diff>, DiffStreamError> {
        let git = self.args.git_service.clone();
        let worktree = self.args.worktree_path.clone();
        let base = self.current_base_commit.clone();
        let stats_only = self.args.stats_only;
        let cumulative = self.cumulative.clone();

        tokio::task::spawn_blocking(move || {
            let diffs = git.get_diffs(&worktree, &base, None)?;
            let mut processed_diffs = Vec::with_capacity(diffs.len());
            for mut diff in diffs {
                apply_stream_omit_policy(&mut diff, &cumulative, stats_only);
                processed_diffs.push(diff);
            }
            Ok(processed_diffs)
        })
        .await?
    }

    async fn handle_fs_events(
        &self,
        events: Vec<DebouncedEvent>,
        canonical_worktree: &Path,
    ) -> Result<(), DiffStreamError> {
        let changed_paths =
            extract_changed_paths(&events, canonical_worktree, &self.args.worktree_path);

        if changed_paths.is_empty() {
            return Ok(());
        }

        let git = self.args.git_service.clone();
        let worktree = self.args.worktree_path.clone();
        let base = self.current_base_commit.clone();
        let cumulative = self.cumulative.clone();
        let known_paths = self.known_paths.clone();
        let sent_file_stats = self.sent_file_stats.clone();
        let stats_only = self.args.stats_only;
        let prefix = self.args.path_prefix.clone();
        let repo_id = self.args.repo_id;

        let patch = tokio::task::spawn_blocking(move || {
            process_file_changes(
                &git,
                &worktree,
                &base,
                &changed_paths,
                &cumulative,
                &known_paths,
                &sent_file_stats,
                stats_only,
                prefix.as_deref(),
                repo_id,
            )
        })
        .await??;

        self.send_patch(patch).await?;
        Ok(())
    }

    async fn handle_git_state_change(&mut self) -> Result<(), DiffStreamError> {
        if self.is_child_of_current_head().await {
            return Ok(()); // Simple commit — reconcile handles via forced discovery
        }
        // Non-commit (checkout/reset/rebase) — debounce reset to batch rapid HEAD changes
        self.pending_reset_since = Some(tokio::time::Instant::now());
        Ok(())
    }

    async fn is_child_of_current_head(&self) -> bool {
        let Some(ref last) = self.last_head_commit else {
            return false;
        };
        let git = self.args.git_service.clone();
        let wt = self.args.worktree_path.clone();
        let last_oid = last.as_oid();
        tokio::task::spawn_blocking(move || git.is_head_child_of(&wt, last_oid))
            .await
            .ok()
            .unwrap_or(false)
    }

    async fn handle_target_check(&mut self) -> Result<(), DiffStreamError> {
        let Ok(Some(repo)) = WorkspaceRepo::find_by_workspace_and_repo_id(
            &self.args.db.pool,
            self.args.workspace_id,
            self.args.repo_id,
        )
        .await
        else {
            return Ok(());
        };

        if repo.target_branch != self.current_target_branch
            && let Some(new_base) = self.recompute_base_commit(&repo.target_branch).await
        {
            self.current_target_branch = repo.target_branch;
            self.current_base_commit = new_base;
            self.reset_stream().await?;
        }
        Ok(())
    }

    async fn handle_reconcile(&mut self) -> Result<(), DiffStreamError> {
        // Skip reconciliation if a debounced reset is pending — it will handle the full reset
        if self.pending_reset_since.is_some() {
            return Ok(());
        }

        let current_head = self.resolve_head_commit().await;
        let head_changed = match (&current_head, &self.last_head_commit) {
            (Some(a), Some(b)) => a.as_oid() != b.as_oid(),
            (None, None) => false,
            _ => true,
        };

        if head_changed {
            let new_base = self
                .recompute_base_commit(&self.current_target_branch)
                .await;

            match new_base {
                Some(base) if base.as_oid() != self.current_base_commit.as_oid() => {
                    if self.base_lookup_error_logged {
                        tracing::info!("Base commit lookup recovered after HEAD change");
                        self.base_lookup_error_logged = false;
                    }
                    self.last_head_commit = current_head;
                    self.current_base_commit = base;
                    self.reset_stream().await?;
                    return Ok(());
                }
                Some(_) => {
                    if self.base_lookup_error_logged {
                        tracing::info!("Base commit lookup recovered after HEAD change");
                        self.base_lookup_error_logged = false;
                    }
                    // Check parent BEFORE updating last_head_commit
                    let is_commit = self.is_child_of_current_head().await;
                    self.last_head_commit = current_head;

                    if !is_commit {
                        self.reset_stream().await?;
                        return Ok(());
                    }
                }
                None => {
                    if !self.base_lookup_error_logged {
                        tracing::error!(
                            "Failed to recompute base commit after HEAD change, will keep retrying"
                        );
                        self.base_lookup_error_logged = true;
                    }
                }
            }
        }

        let force_discovery = head_changed;

        let known: HashSet<String> = self.known_paths.read().unwrap().clone();
        let worktree_for_stat = self.args.worktree_path.clone();
        let sent_stats = self.sent_file_stats.clone();

        let stat_changed: Vec<String> = tokio::task::spawn_blocking(move || {
            let stats_guard = sent_stats.read().unwrap();
            known
                .iter()
                .filter(|path| {
                    let abs = worktree_for_stat.join(path);
                    let cur = std::fs::metadata(&abs)
                        .ok()
                        .and_then(|m| m.modified().ok().map(|mt| (mt, m.len())));
                    match (cur, stats_guard.get(path.as_str())) {
                        (Some(c), Some(p)) => c != *p,
                        (None, Some(_)) => true,
                        (Some(_), None) => true,
                        (None, None) => false,
                    }
                })
                .cloned()
                .collect()
        })
        .await?;

        self.reconcile_cycle = self.reconcile_cycle.wrapping_add(1);
        let run_discovery = force_discovery
            || self.needs_post_reset_discovery
            || !stat_changed.is_empty()
            || self.reconcile_cycle.is_multiple_of(6);

        if stat_changed.is_empty() && !run_discovery {
            return Ok(());
        }

        let git = self.args.git_service.clone();
        let wt = self.args.worktree_path.clone();
        let base = self.current_base_commit.clone();
        let fresh_paths =
            tokio::task::spawn_blocking(move || git.get_diff_file_paths(&wt, &base)).await??;
        self.needs_post_reset_discovery = false;

        // Batch remove ops
        let removed: Vec<String> = self
            .known_paths
            .read()
            .unwrap()
            .difference(&fresh_paths)
            .cloned()
            .collect();
        if !removed.is_empty() {
            let repo_key = self.repo_key();
            let mut ops = Vec::new();
            for path in &removed {
                let patch = ConversationPatch::remove_repo_diff(&repo_key, path);
                ops.extend(patch.0);
                self.known_paths.write().unwrap().remove(path);
                self.sent_file_stats.write().unwrap().remove(path);
            }
            self.send_patch(Patch(ops)).await?;
        }

        let new_files: Vec<String> = fresh_paths
            .difference(&self.known_paths.read().unwrap())
            .cloned()
            .collect();
        let mut paths_to_diff: Vec<String> = stat_changed
            .into_iter()
            .filter(|p| fresh_paths.contains(p))
            .collect();
        paths_to_diff.extend(new_files);

        if !paths_to_diff.is_empty() {
            self.rediff_paths(&paths_to_diff).await?;
        }

        Ok(())
    }

    async fn rediff_paths(&self, paths: &[String]) -> Result<(), DiffStreamError> {
        let git = self.args.git_service.clone();
        let worktree = self.args.worktree_path.clone();
        let base = self.current_base_commit.clone();
        let cumulative = self.cumulative.clone();
        let known_paths = self.known_paths.clone();
        let sent_file_stats = self.sent_file_stats.clone();
        let stats_only = self.args.stats_only;
        let prefix = self.args.path_prefix.clone();
        let repo_id = self.args.repo_id;
        let paths = paths.to_vec();

        let patch = tokio::task::spawn_blocking(move || {
            process_file_changes(
                &git,
                &worktree,
                &base,
                &paths,
                &cumulative,
                &known_paths,
                &sent_file_stats,
                stats_only,
                prefix.as_deref(),
                repo_id,
            )
        })
        .await??;

        self.send_patch(patch).await?;
        Ok(())
    }

    async fn recompute_base_commit(&self, target_branch: &str) -> Option<Commit> {
        let git = self.args.git_service.clone();
        let repo_path = self.args.repo_path.clone();
        let branch = self.args.branch.clone();
        let target = target_branch.to_string();

        tokio::task::spawn_blocking(move || git.get_base_commit(&repo_path, &branch, &target).ok())
            .await
            .ok()
            .flatten()
    }

    async fn resolve_head_commit(&self) -> Option<Commit> {
        let git = self.args.git_service.clone();
        let wt = self.args.worktree_path.clone();
        tokio::task::spawn_blocking(move || git.get_head_commit(&wt))
            .await
            .ok()
            .flatten()
    }

    fn repo_key(&self) -> String {
        self.args
            .path_prefix
            .clone()
            .unwrap_or_else(|| "_".to_string())
    }
}

fn prefix_path(path: String, prefix: Option<&str>) -> String {
    match prefix {
        Some(p) => format!("{p}/{path}"),
        None => path,
    }
}

pub fn apply_stream_omit_policy(diff: &mut Diff, sent_bytes: &Arc<AtomicUsize>, stats_only: bool) {
    if stats_only {
        omit_diff_contents(diff);
        return;
    }

    let mut size = 0usize;
    if let Some(ref s) = diff.old_content {
        size += s.len();
    }
    if let Some(ref s) = diff.new_content {
        size += s.len();
    }

    if size == 0 {
        return;
    }

    let current = sent_bytes.load(Ordering::Relaxed);
    if current.saturating_add(size) > MAX_CUMULATIVE_DIFF_BYTES {
        omit_diff_contents(diff);
    } else {
        let _ = sent_bytes.fetch_add(size, Ordering::Relaxed);
    }
}

fn omit_diff_contents(diff: &mut Diff) {
    if diff.additions.is_none()
        && diff.deletions.is_none()
        && (diff.old_content.is_some() || diff.new_content.is_some())
    {
        let old = diff.old_content.as_deref().unwrap_or("");
        let new = diff.new_content.as_deref().unwrap_or("");
        let (add, del) = compute_line_change_counts(old, new);
        diff.additions = Some(add);
        diff.deletions = Some(del);
    }

    diff.old_content = None;
    diff.new_content = None;
    diff.content_omitted = true;
}

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

#[allow(clippy::too_many_arguments)]
fn process_file_changes(
    git_service: &GitService,
    worktree_path: &Path,
    base_commit: &Commit,
    changed_paths: &[String],
    cumulative_bytes: &Arc<AtomicUsize>,
    known_paths: &Arc<std::sync::RwLock<HashSet<String>>>,
    sent_file_stats: &SentFileStats,
    stats_only: bool,
    path_prefix: Option<&str>,
    repo_id: Uuid,
) -> Result<Patch, DiffStreamError> {
    let path_filter: Vec<&str> = changed_paths.iter().map(|s| s.as_str()).collect();
    let current_diffs = git_service.get_diffs(worktree_path, base_commit, Some(&path_filter))?;

    let mut ops = Vec::new();
    let mut files_with_diffs = HashSet::new();

    for mut diff in current_diffs {
        let raw_file_path = GitService::diff_path(&diff);
        files_with_diffs.insert(raw_file_path.clone());
        known_paths.write().unwrap().insert(raw_file_path.clone());

        let abs = worktree_path.join(&raw_file_path);
        if let Ok(meta) = std::fs::metadata(&abs)
            && let Ok(mtime) = meta.modified()
        {
            sent_file_stats
                .write()
                .unwrap()
                .insert(raw_file_path.clone(), (mtime, meta.len()));
        }

        apply_stream_omit_policy(&mut diff, cumulative_bytes, stats_only);

        if let Some(old) = diff.old_path {
            diff.old_path = Some(prefix_path(old, path_prefix));
        }
        if let Some(new) = diff.new_path {
            diff.new_path = Some(prefix_path(new, path_prefix));
        }
        diff.repo_id = Some(repo_id);

        let repo_key = path_prefix.unwrap_or("_");
        let patch = ConversationPatch::add_repo_diff(repo_key, &raw_file_path, diff);
        ops.extend(patch.0);
    }

    for changed_path in changed_paths {
        if !files_with_diffs.contains(changed_path) {
            let repo_key = path_prefix.unwrap_or("_");
            let patch = ConversationPatch::remove_repo_diff(repo_key, changed_path);
            ops.extend(patch.0);
            known_paths.write().unwrap().remove(changed_path);
            sent_file_stats.write().unwrap().remove(changed_path);
        }
    }

    Ok(Patch(ops))
}

/// Watches `.git/HEAD` and `.git/logs/HEAD` for changes.
/// Correctly resolves gitdir even for worktrees.
fn setup_git_watcher(
    git: &GitService,
    worktree_path: &Path,
) -> Option<(
    Debouncer<RecommendedWatcher, RecommendedCache>,
    tokio::sync::watch::Receiver<()>,
)> {
    let Ok(gitdir) = git.get_git_dir(worktree_path) else {
        tracing::warn!(
            "Failed to open git repo at {:?}, git events will be ignored",
            worktree_path
        );
        return None;
    };

    // For worktrees, gitdir points to the actual gitdir (e.g. `.git/worktrees/name` or `.git/`).
    let paths_to_watch = vec![gitdir.join("HEAD"), gitdir.join("logs").join("HEAD")];

    let (tx, rx) = tokio::sync::watch::channel(());

    // Use a short debounce because git operations often touch both files in quick succession.
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        None,
        move |res: DebounceEventResult| {
            if res.is_ok() {
                let _ = tx.send(());
            }
        },
    )
    .ok()?;

    let mut watched_any = false;
    for path in paths_to_watch {
        if path.exists() {
            if let Err(e) = debouncer.watch(&path, RecursiveMode::NonRecursive) {
                tracing::debug!("Failed to watch git path {:?}: {}", path, e);
            } else {
                watched_any = true;
            }
        }
    }

    if !watched_any {
        return None;
    }

    Some((debouncer, rx))
}
