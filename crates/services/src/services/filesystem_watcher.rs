use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use futures::{
    SinkExt, StreamExt,
    channel::mpsc::{Receiver, channel},
};
use ignore::{
    WalkBuilder,
    gitignore::{Gitignore, GitignoreBuilder},
};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};

fn canonicalize_lossy(path: &Path) -> PathBuf {
    dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn build_gitignore_set(root: &Path) -> Result<Gitignore, ignore::Error> {
    let mut builder = GitignoreBuilder::new(root);

    // Walk once to collect all .gitignore files under root
    for result in WalkBuilder::new(root)
        .follow_links(false)
        .hidden(false) // we *want* to see .gitignore
        .standard_filters(false) // do not apply default ignores while walking
        .git_ignore(false) // we'll add them manually
        .git_exclude(false)
        .build()
    {
        let dir_entry = result?;
        if dir_entry
            .file_type()
            .map(|ft| ft.is_file())
            .unwrap_or(false)
            && dir_entry
                .path()
                .file_name()
                .is_some_and(|name| name == ".gitignore")
        {
            builder.add(dir_entry.path());
        }
    }

    // Optionally include repo-local excludes
    let info_exclude = root.join(".git/info/exclude");
    if info_exclude.exists() {
        builder.add(info_exclude);
    }

    Ok(builder.build()?)
}

fn should_forward(event: &Event, gi: &Gitignore, canonical_root: &Path) -> bool {
    event.paths.iter().all(|orig_path| {
        let canonical_path = canonicalize_lossy(orig_path);

        // Convert absolute path to relative path from the gitignore root
        let relative_path = match canonical_path.strip_prefix(canonical_root) {
            Ok(rel_path) => rel_path,
            Err(_) => {
                // Path is outside the watched root, don't ignore it
                return true;
            }
        };

        // Heuristic: assume paths without extensions are directories
        // This works for most cases and avoids filesystem syscalls
        let is_dir = relative_path.extension().is_none();
        let matched = gi.matched_path_or_any_parents(&relative_path, is_dir);

        !matched.is_ignore()
    })
}

pub fn async_watcher(
    root: PathBuf,
) -> notify::Result<(RecommendedWatcher, Receiver<notify::Result<Event>>, PathBuf)> {
    let canonical_root = canonicalize_lossy(&root);
    let gi_set = Arc::new(
        build_gitignore_set(&canonical_root)
            .map_err(|e| notify::Error::generic(&format!("Failed to build gitignore: {}", e)))?,
    );
    let (mut tx, rx) = channel(1);

    let gi_clone = gi_set.clone();
    let root_clone = canonical_root.clone();
    let watcher = RecommendedWatcher::new(
        move |res| {
            if let Ok(ref ev) = res {
                if !should_forward(ev, &gi_clone, &root_clone) {
                    return;
                }
            }
            futures::executor::block_on(async {
                tx.send(res).await.ok();
            })
        },
        Config::default(),
    )?;

    Ok((watcher, rx, canonical_root))
}

async fn async_watch<P: AsRef<Path>>(path: P) -> notify::Result<()> {
    let (mut watcher, mut rx, canonical_path) = async_watcher(path.as_ref().to_path_buf())?;

    // Add a path to be watched. All files and directories at that path and
    // below will be monitored for changes.
    watcher.watch(&canonical_path, RecursiveMode::Recursive)?;

    while let Some(res) = rx.next().await {
        match res {
            Ok(event) => println!("changed: {:?}", event),
            Err(e) => println!("watch error: {:?}", e),
        }
    }

    Ok(())
}
