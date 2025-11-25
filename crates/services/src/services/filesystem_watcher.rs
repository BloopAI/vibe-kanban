use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use futures::{
    SinkExt,
    channel::mpsc::{Receiver, channel},
};
use ignore::{
    WalkBuilder,
    gitignore::{Gitignore, GitignoreBuilder},
};
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    DebounceEventResult, DebouncedEvent, Debouncer, RecommendedCache, new_debouncer,
};
use thiserror::Error;

pub type WatcherComponents = (
    Debouncer<RecommendedWatcher, RecommendedCache>,
    Receiver<DebounceEventResult>,
    PathBuf,
);

#[derive(Debug, Error)]
pub enum FilesystemWatcherError {
    #[error(transparent)]
    Notify(#[from] notify::Error),
    #[error(transparent)]
    Ignore(#[from] ignore::Error),
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error("Failed to build gitignore: {0}")]
    GitignoreBuilder(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
}

fn canonicalize_lossy(path: &Path) -> PathBuf {
    dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Directories that should always be skipped regardless of gitignore.
/// .git is not in .gitignore but should never be watched.
const ALWAYS_SKIP_DIRS: &[&str] = &[".git"];

fn should_skip_dir(name: &str) -> bool {
    ALWAYS_SKIP_DIRS.contains(&name)
}

fn build_gitignore_set(root: &Path) -> Result<Gitignore, FilesystemWatcherError> {
    let mut builder = GitignoreBuilder::new(root);

    // Walk once to collect all .gitignore files under root
    // Use git_ignore(true) to avoid walking into gitignored directories
    WalkBuilder::new(root)
        .follow_links(false)
        .hidden(false) // we *want* to see .gitignore
        .git_ignore(true) // Respect gitignore to skip heavy directories
        .filter_entry(|entry| {
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

            // Skip .git directory
            if is_dir {
                if let Some(name) = entry.file_name().to_str() {
                    if should_skip_dir(name) {
                        return false;
                    }
                }
            }

            // only recurse into directories and .gitignore files
            is_dir
                || entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name == ".gitignore")
        })
        .build()
        .try_for_each(|result| {
            // everything that is not a directory and is named .gitignore
            match result {
                Ok(dir_entry) => {
                    if !dir_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        builder.add(dir_entry.path());
                    }
                    Ok(())
                }
                Err(err)
                    if err.io_error().is_some_and(|io_err| {
                        io_err.kind() == std::io::ErrorKind::PermissionDenied
                    }) =>
                {
                    // Skip entries we don't have permission to read
                    tracing::warn!("Permission denied reading path: {}", err);
                    Ok(())
                }
                Err(e) => Err(FilesystemWatcherError::Ignore(e)),
            }
        })?;

    // Optionally include repo-local excludes
    let info_exclude = root.join(".git/info/exclude");
    if info_exclude.exists() {
        builder.add(info_exclude);
    }

    Ok(builder.build()?)
}

fn path_allowed(path: &Path, gi: &Gitignore, canonical_root: &Path) -> bool {
    let canonical_path = canonicalize_lossy(path);

    // Convert absolute path to relative path from the gitignore root
    let relative_path = match canonical_path.strip_prefix(canonical_root) {
        Ok(rel_path) => rel_path,
        Err(_) => {
            // Path is outside the watched root, don't ignore it
            return true;
        }
    };

    // Check if path is inside any of the always-skip directories
    for component in relative_path.components() {
        if let std::path::Component::Normal(name) = component {
            if let Some(name_str) = name.to_str() {
                if should_skip_dir(name_str) {
                    return false;
                }
            }
        }
    }

    // Heuristic: assume paths without extensions are directories
    // This works for most cases and avoids filesystem syscalls
    let is_dir = relative_path.extension().is_none();
    let matched = gi.matched_path_or_any_parents(relative_path, is_dir);

    !matched.is_ignore()
}

fn debounced_should_forward(event: &DebouncedEvent, gi: &Gitignore, canonical_root: &Path) -> bool {
    // DebouncedEvent is a struct that wraps the underlying notify::Event
    if event.kind.is_access() {
        // Ignore access events
        return false;
    }
    // We can check its paths field to determine if the event should be forwarded
    event
        .paths
        .iter()
        .all(|path| path_allowed(path, gi, canonical_root))
}

/// Collect directories to watch, respecting gitignore and excluding .git.
/// This prevents OS-level watchers from being set up on heavy directories like node_modules.
fn collect_watch_directories(root: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    WalkBuilder::new(root)
        .follow_links(false)
        .hidden(false)
        .git_ignore(true) // Respect gitignore to skip node_modules, target, etc.
        .filter_entry(|entry| {
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
            if !is_dir {
                return false;
            }

            // Skip .git directory (not in .gitignore but should never be watched)
            if let Some(name) = entry.file_name().to_str() {
                if should_skip_dir(name) {
                    return false;
                }
            }

            true
        })
        .build()
        .filter_map(|result| result.ok())
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .for_each(|entry| {
            dirs.push(entry.into_path());
        });

    dirs
}

pub fn async_watcher(root: PathBuf) -> Result<WatcherComponents, FilesystemWatcherError> {
    let canonical_root = canonicalize_lossy(&root);
    let gi_set = Arc::new(build_gitignore_set(&canonical_root)?);
    let (mut tx, rx) = channel(64); // Increased capacity for error bursts

    let gi_clone = gi_set.clone();
    let root_clone = canonical_root.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        None, // Use default config
        move |res: DebounceEventResult| {
            match res {
                Ok(events) => {
                    // Filter events and only send allowed ones
                    let filtered_events: Vec<DebouncedEvent> = events
                        .into_iter()
                        .filter(|ev| debounced_should_forward(ev, &gi_clone, &root_clone))
                        .collect();

                    if !filtered_events.is_empty() {
                        let filtered_result = Ok(filtered_events);
                        futures::executor::block_on(async {
                            tx.send(filtered_result).await.ok();
                        });
                    }
                }
                Err(errors) => {
                    // Always forward errors
                    futures::executor::block_on(async {
                        tx.send(Err(errors)).await.ok();
                    });
                }
            }
        },
    )?;

    // Collect directories to watch, respecting gitignore and excluding .git.
    // Use NonRecursive mode for each directory to avoid OS-level watching of excluded dirs.
    let watch_dirs = collect_watch_directories(&canonical_root);
    tracing::debug!(
        "Setting up file watcher for {} directories (respecting gitignore)",
        watch_dirs.len()
    );

    for dir in watch_dirs {
        if let Err(e) = debouncer.watch(&dir, RecursiveMode::NonRecursive) {
            tracing::warn!("Failed to watch directory {:?}: {}", dir, e);
        }
    }

    Ok((debouncer, rx, canonical_root))
}
