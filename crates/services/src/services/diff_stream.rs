use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use executors::logs::utils::{ConversationPatch, patch::escape_json_pointer_segment};
use futures::StreamExt;
use notify_debouncer_full::DebouncedEvent;
use thiserror::Error;
use tokio::{sync::mpsc, task::JoinHandle};
use tokio_stream::wrappers::UnboundedReceiverStream;
use utils::{
    diff::{self, Diff},
    log_msg::LogMsg,
};

use crate::services::{
    filesystem_watcher::{self, FilesystemWatcherError},
    git::{Commit, DiffTarget, GitService, GitServiceError},
};

/// Maximum cumulative diff bytes to stream before omitting content (200MB)
pub const MAX_CUMULATIVE_DIFF_BYTES: usize = 200 * 1024 * 1024;

/// Errors that can occur during diff stream creation and operation
#[derive(Error, Debug)]
pub enum DiffStreamError {
    #[error("Git service error: {0}")]
    GitService(#[from] GitServiceError),
    #[error("Filesystem watcher error: {0}")]
    FilesystemWatcher(#[from] FilesystemWatcherError),
    #[error("Task join error: {0}")]
    TaskJoin(#[from] tokio::task::JoinError),
}

/// Diff stream that owns the filesystem watcher task
/// When this stream is dropped, the watcher is automatically cleaned up
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
        // Delegate to inner stream
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
    /// Create a new DiffStreamHandle from a boxed stream and optional watcher task
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

struct DiffWatcherContext {
    git_service: GitService,
    worktree_path: PathBuf,
    base_commit: Commit,
    cumulative: Arc<AtomicUsize>,
    full_sent: Arc<std::sync::RwLock<HashSet<String>>>,
    stats_only: bool,
    tx: mpsc::UnboundedSender<Result<LogMsg, io::Error>>,
}

impl DiffWatcherContext {
    fn handle_events(&self, events: Vec<DebouncedEvent>, canonical_worktree_path: &Path) -> bool {
        let changed_paths =
            extract_changed_paths(&events, canonical_worktree_path, &self.worktree_path);

        if changed_paths.is_empty() {
            return true;
        }

        match process_file_changes(
            &self.git_service,
            &self.worktree_path,
            &self.base_commit,
            &changed_paths,
            &self.cumulative,
            &self.full_sent,
            self.stats_only,
        ) {
            Ok(messages) => send_messages(&self.tx, messages),
            Err(err) => {
                tracing::error!("Error processing file changes: {err}");
                send_error(&self.tx, err.to_string());
                false
            }
        }
    }
}

pub fn create(
    git_service: GitService,
    worktree_path: PathBuf,
    base_commit: Commit,
    stats_only: bool,
) -> Result<DiffStreamHandle, DiffStreamError> {
    let initial_diffs_raw = git_service.get_diffs(
        DiffTarget::Worktree {
            worktree_path: &worktree_path,
            base_commit: &base_commit,
        },
        None,
    )?;

    let cumulative = Arc::new(AtomicUsize::new(0));
    let full_sent = Arc::new(std::sync::RwLock::new(HashSet::<String>::new()));
    let mut initial_diffs = Vec::with_capacity(initial_diffs_raw.len());
    for mut diff in initial_diffs_raw {
        apply_stream_omit_policy(&mut diff, &cumulative, stats_only);
        initial_diffs.push(diff);
    }

    {
        let mut guard = full_sent.write().unwrap();
        for diff in &initial_diffs {
            if !diff.content_omitted {
                guard.insert(GitService::diff_path(diff));
            }
        }
    }

    let (tx, rx) = mpsc::unbounded_channel::<Result<LogMsg, io::Error>>();
    if !send_initial_diffs(&tx, initial_diffs) {
        return Ok(DiffStreamHandle::new(
            UnboundedReceiverStream::new(rx).boxed(),
            None,
        ));
    }

    let tx_clone = tx.clone();
    let ctx = DiffWatcherContext {
        git_service,
        worktree_path: worktree_path.clone(),
        base_commit,
        cumulative,
        full_sent,
        stats_only,
        tx: tx_clone,
    };

    let watcher_task = tokio::spawn(async move {
        let worktree_path_for_spawn = worktree_path;
        let watcher_result = tokio::task::spawn_blocking(move || {
            filesystem_watcher::async_watcher(worktree_path_for_spawn)
        })
        .await;

        let (debouncer, mut watcher_rx, canonical_worktree_path) = match watcher_result {
            Ok(Ok(parts)) => parts,
            Ok(Err(e)) => {
                tracing::error!("Failed to set up filesystem watcher: {e}");
                send_error(&ctx.tx, e.to_string());
                return;
            }
            Err(join_err) => {
                tracing::error!("Failed to spawn watcher setup: {join_err}");
                send_error(
                    &ctx.tx,
                    format!("Failed to spawn watcher setup: {join_err}"),
                );
                return;
            }
        };

        let _debouncer_guard = debouncer;

        while let Some(result) = watcher_rx.next().await {
            match result {
                Ok(events) => {
                    if !ctx.handle_events(events, &canonical_worktree_path) {
                        return;
                    }
                }
                Err(errors) => {
                    let message = errors
                        .iter()
                        .map(|e| e.to_string())
                        .collect::<Vec<_>>()
                        .join("; ");
                    tracing::error!("Filesystem watcher error: {message}");
                    send_error(&ctx.tx, message);
                    return;
                }
            }
        }
    });

    drop(tx);

    Ok(DiffStreamHandle::new(
        UnboundedReceiverStream::new(rx).boxed(),
        Some(watcher_task),
    ))
}

fn send_initial_diffs(
    tx: &mpsc::UnboundedSender<Result<LogMsg, io::Error>>,
    diffs: Vec<Diff>,
) -> bool {
    for diff in diffs {
        let entry_index = GitService::diff_path(&diff);
        let patch = ConversationPatch::add_diff(escape_json_pointer_segment(&entry_index), diff);
        if tx.send(Ok(LogMsg::JsonPatch(patch))).is_err() {
            return false;
        }
    }
    true
}

fn send_messages(
    tx: &mpsc::UnboundedSender<Result<LogMsg, io::Error>>,
    messages: Vec<LogMsg>,
) -> bool {
    for msg in messages {
        if tx.send(Ok(msg)).is_err() {
            return false;
        }
    }
    true
}

fn send_error(tx: &mpsc::UnboundedSender<Result<LogMsg, io::Error>>, message: String) {
    let _ = tx.send(Err(io::Error::other(message)));
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
        let (add, del) = diff::compute_line_change_counts(old, new);
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

fn process_file_changes(
    git_service: &GitService,
    worktree_path: &Path,
    base_commit: &Commit,
    changed_paths: &[String],
    cumulative_bytes: &Arc<AtomicUsize>,
    full_sent_paths: &Arc<std::sync::RwLock<HashSet<String>>>,
    stats_only: bool,
) -> Result<Vec<LogMsg>, DiffStreamError> {
    let path_filter: Vec<&str> = changed_paths.iter().map(|s| s.as_str()).collect();

    let current_diffs = git_service.get_diffs(
        DiffTarget::Worktree {
            worktree_path,
            base_commit,
        },
        Some(&path_filter),
    )?;

    let mut msgs = Vec::new();
    let mut files_with_diffs = HashSet::new();

    for mut diff in current_diffs {
        let file_path = GitService::diff_path(&diff);
        files_with_diffs.insert(file_path.clone());
        apply_stream_omit_policy(&mut diff, cumulative_bytes, stats_only);

        if diff.content_omitted {
            if full_sent_paths.read().unwrap().contains(&file_path) {
                continue;
            }
        } else {
            let mut guard = full_sent_paths.write().unwrap();
            guard.insert(file_path.clone());
        }

        let patch = ConversationPatch::add_diff(escape_json_pointer_segment(&file_path), diff);
        msgs.push(LogMsg::JsonPatch(patch));
    }

    for changed_path in changed_paths {
        if !files_with_diffs.contains(changed_path) {
            let patch = ConversationPatch::remove_diff(escape_json_pointer_segment(changed_path));
            msgs.push(LogMsg::JsonPatch(patch));
        }
    }

    Ok(msgs)
}
