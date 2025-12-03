use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use futures::{
    SinkExt, StreamExt,
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
    Arc<Mutex<Debouncer<RecommendedWatcher, RecommendedCache>>>,
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

/// Check if the platform supports efficient native recursive watching.
/// macOS (FSEvents) and Windows (ReadDirectoryChangesW) support recursive watching natively.
/// Linux (inotify) does not - it requires a watch descriptor per directory.
fn platform_supports_native_recursive() -> bool {
    cfg!(target_os = "macos") || cfg!(target_os = "windows")
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
            if is_dir
                && let Some(name) = entry.file_name().to_str()
                && should_skip_dir(name)
            {
                return false;
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
    if let Some(parent) = relative_path.parent() {
        for component in parent.components() {
            if let std::path::Component::Normal(name) = component
                && let Some(name_str) = name.to_str()
                && should_skip_dir(name_str)
            {
                return false;
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

/// Represents a directory to watch with its recursive mode.
#[derive(Debug, Clone)]
struct WatchTarget {
    path: PathBuf,
    recursive: RecursiveMode,
}

/// Check if a directory or any of its descendants has gitignored directories.
/// Used on macOS/Windows to determine if we can watch recursively.
///
/// This checks recursively to ensure we don't use Recursive mode on a directory
/// that has gitignored descendants (e.g., packages/app1/node_modules).
fn has_ignored_descendants(
    dir: &Path,
    gi: &Gitignore,
    canonical_root: &Path,
    allowed_dirs: &std::collections::HashSet<PathBuf>,
) -> bool {
    // Read immediate children
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        let path = entry.path();

        // Check if this subdirectory should be skipped
        if let Some(name) = path.file_name().and_then(|n| n.to_str())
            && should_skip_dir(name)
        {
            return true;
        }

        // If it's not in allowed_dirs, it means WalkBuilder skipped it (gitignored)
        if !allowed_dirs.contains(&path) && !path_allowed(&path, gi, canonical_root) {
            return true;
        }

        if has_ignored_descendants(&path, gi, canonical_root, allowed_dirs) {
            return true;
        }
    }

    false
}

/// Collect directories to watch, respecting gitignore and excluding .git.
/// On macOS/Windows, use recursive mode for directories without ignored subdirectories.
/// On Linux, use non-recursive mode for all directories.
fn collect_watch_directories(root: &Path, gi: &Gitignore) -> Vec<WatchTarget> {
    use std::collections::HashSet;

    let use_recursive = platform_supports_native_recursive();

    let allowed_dirs: HashSet<PathBuf> = WalkBuilder::new(root)
        .follow_links(false)
        .hidden(false)
        .git_ignore(true) // Respect gitignore to skip node_modules, target, etc.
        .filter_entry(|entry| {
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
            if !is_dir {
                return false;
            }

            if let Some(name) = entry.file_name().to_str()
                && should_skip_dir(name)
            {
                return false;
            }

            true
        })
        .build()
        .filter_map(|result| result.ok())
        .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .map(|entry| entry.into_path())
        .collect();

    let mut targets: Vec<WatchTarget> = allowed_dirs
        .iter()
        .map(|path| {
            let recursive_mode = if use_recursive {
                if has_ignored_descendants(path, gi, root, &allowed_dirs) {
                    RecursiveMode::NonRecursive
                } else {
                    RecursiveMode::Recursive
                }
            } else {
                RecursiveMode::NonRecursive
            };

            WatchTarget {
                path: path.clone(),
                recursive: recursive_mode,
            }
        })
        .collect();

    let targets_clone = targets.clone();
    targets.retain(|target| {
        !targets_clone.iter().any(|parent| {
            parent.recursive == RecursiveMode::Recursive
                && target.path.starts_with(&parent.path)
                && target.path != parent.path
        })
    });

    targets
}

/// Helper to determine watch mode for a directory (used for dynamically added directories).
/// This does a simple check of immediate children only, since we don't have the full
/// allowed_dirs set at runtime.
fn determine_watch_mode(path: &Path, gi: &Gitignore, canonical_root: &Path) -> RecursiveMode {
    if !platform_supports_native_recursive() {
        return RecursiveMode::NonRecursive;
    }

    let Ok(entries) = std::fs::read_dir(path) else {
        return RecursiveMode::Recursive;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        let child_path = entry.path();

        if let Some(name) = child_path.file_name().and_then(|n| n.to_str())
            && should_skip_dir(name)
        {
            return RecursiveMode::NonRecursive;
        }

        if !path_allowed(&child_path, gi, canonical_root) {
            return RecursiveMode::NonRecursive;
        }
    }

    RecursiveMode::Recursive
}

/// Add a watch for a newly created directory
fn add_directory_watch(
    debouncer: &mut Debouncer<RecommendedWatcher, RecommendedCache>,
    watched_dirs: &mut HashSet<PathBuf>,
    dir_path: &Path,
    gi: &Gitignore,
    canonical_root: &Path,
) {
    if !path_allowed(dir_path, gi, canonical_root) {
        return;
    }

    if watched_dirs.contains(dir_path) {
        return;
    }

    let mode = determine_watch_mode(dir_path, gi, canonical_root);

    if let Err(e) = debouncer.watch(dir_path, mode) {
        tracing::warn!("Failed to watch new directory {:?}: {}", dir_path, e);
    } else {
        watched_dirs.insert(dir_path.to_path_buf());
    }
}

/// Remove a watch for a deleted directory
fn remove_directory_watch(
    debouncer: &mut Debouncer<RecommendedWatcher, RecommendedCache>,
    watched_dirs: &mut HashSet<PathBuf>,
    dir_path: &Path,
) {
    if watched_dirs.remove(dir_path)
        && let Err(e) = debouncer.unwatch(dir_path)
    {
        tracing::warn!("Could not unwatch deleted directory {:?}: {}", dir_path, e);
    }
}

pub fn async_watcher(root: PathBuf) -> Result<WatcherComponents, FilesystemWatcherError> {
    let canonical_root = canonicalize_lossy(&root);
    let gi_set = Arc::new(build_gitignore_set(&canonical_root)?);

    let (mut raw_tx, mut raw_rx) = channel::<DebounceEventResult>(64);
    let (mut filtered_tx, filtered_rx) = channel::<DebounceEventResult>(64);

    let gi_clone = gi_set.clone();
    let root_for_task = canonical_root.clone();

    let debouncer_unwrapped = new_debouncer(
        Duration::from_millis(200),
        None,
        move |res: DebounceEventResult| {
            futures::executor::block_on(async {
                raw_tx.send(res).await.ok();
            });
        },
    )?;

    let debouncer = Arc::new(Mutex::new(debouncer_unwrapped));
    let debouncer_for_init = debouncer.clone();
    let debouncer_for_task = debouncer.clone();

    let watched_dirs: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
    let watched_dirs_for_task = watched_dirs.clone();

    let watch_targets = collect_watch_directories(&canonical_root, &gi_set);
    {
        let mut debouncer_guard = debouncer_for_init.lock().unwrap();
        let mut watched = watched_dirs.lock().unwrap();

        for target in &watch_targets {
            if let Err(e) = debouncer_guard.watch(&target.path, target.recursive) {
                tracing::warn!("Failed to watch {:?}: {}", target.path, e);
            } else {
                watched.insert(target.path.clone());
            }
        }
    }

    std::thread::spawn(move || {
        while let Some(result) = futures::executor::block_on(async { raw_rx.next().await }) {
            match result {
                Ok(events) => {
                    let mut debouncer_guard = debouncer_for_task.lock().unwrap();
                    let mut watched = watched_dirs_for_task.lock().unwrap();

                    for event in &events {
                        if event.kind.is_create() {
                            for path in &event.paths {
                                if path.is_dir() {
                                    add_directory_watch(
                                        &mut debouncer_guard,
                                        &mut watched,
                                        path,
                                        &gi_clone,
                                        &root_for_task,
                                    );
                                }
                            }
                        } else if event.kind.is_remove() {
                            for path in &event.paths {
                                remove_directory_watch(&mut debouncer_guard, &mut watched, path);
                            }
                        }
                    }

                    drop(debouncer_guard);
                    drop(watched);

                    let filtered_events: Vec<DebouncedEvent> = events
                        .into_iter()
                        .filter(|ev| debounced_should_forward(ev, &gi_set, &root_for_task))
                        .collect();

                    if !filtered_events.is_empty() {
                        futures::executor::block_on(async {
                            filtered_tx.send(Ok(filtered_events)).await.ok();
                        });
                    }
                }
                Err(errors) => {
                    futures::executor::block_on(async {
                        filtered_tx.send(Err(errors)).await.ok();
                    });
                }
            }
        }
    });

    Ok((debouncer, filtered_rx, canonical_root))
}
