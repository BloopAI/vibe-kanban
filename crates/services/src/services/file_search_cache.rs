use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use dashmap::DashMap;
use db::models::project::{SearchMatchType, SearchResult};
use fst::{Map, MapBuilder};
use ignore::WalkBuilder;
use moka::future::Cache;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, new_debouncer};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use ts_rs::TS;

use super::{
    file_ranker::{FileRanker, FileStats},
    git::GitService,
};

/// Search mode for different use cases
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum SearchMode {
    #[default]
    TaskForm, // Default: exclude ignored files (clean results)
    Settings, // Include ignored files (for project config like .env)
}

/// Search query parameters for typed Axum extraction
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default)]
    pub mode: SearchMode,
}

/// FST-indexed file search result
#[derive(Clone, Debug)]
pub struct IndexedFile {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
    pub path_lowercase: Arc<str>,
    pub is_ignored: bool, // Track if file is gitignored
}

/// File index build result containing indexed files and FST map
#[derive(Debug)]
pub struct FileIndex {
    pub files: Vec<IndexedFile>,
    pub map: Map<Vec<u8>>,
}

/// Errors that can occur during file index building
#[derive(Error, Debug)]
pub enum FileIndexError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Fst(#[from] fst::Error),
    #[error(transparent)]
    Walk(#[from] ignore::Error),
    #[error(transparent)]
    StripPrefix(#[from] std::path::StripPrefixError),
}

/// Cached repository data with FST index and git stats
#[derive(Clone)]
pub struct CachedRepo {
    pub head_sha: String,
    pub fst_index: Map<Vec<u8>>,
    pub indexed_files: Vec<IndexedFile>,
    pub stats: Arc<FileStats>,
    pub build_ts: Instant,
}

/// Cache miss error
#[derive(Debug)]
pub enum CacheError {
    Miss,
    BuildError(String),
}

/// File search cache with FST indexing
pub struct FileSearchCache {
    cache: Cache<PathBuf, CachedRepo>,
    git_service: GitService,
    file_ranker: FileRanker,
    build_queue: mpsc::UnboundedSender<PathBuf>,
    watchers: DashMap<PathBuf, RecommendedWatcher>,
}

impl FileSearchCache {
    pub fn new() -> Self {
        let (build_sender, build_receiver) = mpsc::unbounded_channel();

        // Create cache with 100MB limit and 1 hour TTL
        let cache = Cache::builder()
            .max_capacity(50) // Max 50 repos
            .time_to_live(Duration::from_secs(3600)) // 1 hour TTL
            .build();

        let cache_for_worker = cache.clone();
        let git_service = GitService::new();
        let file_ranker = FileRanker::new();

        // Spawn background worker
        let worker_git_service = git_service.clone();
        let worker_file_ranker = file_ranker.clone();
        tokio::spawn(async move {
            Self::background_worker(
                build_receiver,
                cache_for_worker,
                worker_git_service,
                worker_file_ranker,
            )
            .await;
        });

        Self {
            cache,
            git_service,
            file_ranker,
            build_queue: build_sender,
            watchers: DashMap::new(),
        }
    }

    /// Search files in repository using cache
    pub async fn search(
        &self,
        repo_path: &Path,
        query: &str,
        mode: SearchMode,
    ) -> Result<Vec<SearchResult>, CacheError> {
        let repo_path_buf = repo_path.to_path_buf();

        // Check if we have a valid cache entry
        if let Some(cached) = self.cache.get(&repo_path_buf).await
            && let Ok(head_info) = self.git_service.get_head_info(&repo_path_buf)
            && head_info.oid == cached.head_sha
        {
            // Cache hit - perform fast search with mode-based filtering
            return Ok(self.search_in_cache(&cached, query, mode).await);
        }

        // Cache miss - trigger background refresh and return error
        if let Err(e) = self.build_queue.send(repo_path_buf) {
            warn!("Failed to enqueue cache build: {}", e);
        }

        Err(CacheError::Miss)
    }

    /// Pre-warm cache for given repositories
    pub async fn warm_repos(&self, repo_paths: Vec<PathBuf>) -> Result<(), String> {
        for repo_path in repo_paths {
            if let Err(e) = self.build_queue.send(repo_path.clone()) {
                error!(
                    "Failed to enqueue repo for warming: {:?} - {}",
                    repo_path, e
                );
            }
        }
        Ok(())
    }

    /// Pre-warm cache for most active projects
    pub async fn warm_most_active(&self, db_pool: &SqlitePool, limit: i32) -> Result<(), String> {
        use db::models::project::Project;

        info!("Starting file search cache warming...");

        // Get most active projects
        let active_projects = Project::find_most_active(db_pool, limit)
            .await
            .map_err(|e| format!("Failed to fetch active projects: {e}"))?;

        if active_projects.is_empty() {
            info!("No active projects found, skipping cache warming");
            return Ok(());
        }

        let repo_paths: Vec<PathBuf> = active_projects
            .iter()
            .map(|p| PathBuf::from(&p.git_repo_path))
            .collect();

        info!(
            "Warming cache for {} projects: {:?}",
            repo_paths.len(),
            repo_paths
        );

        // Warm the cache
        self.warm_repos(repo_paths.clone())
            .await
            .map_err(|e| format!("Failed to warm cache: {e}"))?;

        // Setup watchers for active projects
        for repo_path in &repo_paths {
            if let Err(e) = self.setup_watcher(repo_path).await {
                warn!("Failed to setup watcher for {:?}: {}", repo_path, e);
            }
        }

        info!("File search cache warming completed");
        Ok(())
    }

    /// Search within cached index with mode-based filtering
    async fn search_in_cache(
        &self,
        cached: &CachedRepo,
        query: &str,
        mode: SearchMode,
    ) -> Vec<SearchResult> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        // Search through indexed files with mode-based filtering
        for indexed_file in &cached.indexed_files {
            if indexed_file.path_lowercase.contains(&query_lower) {
                // Apply mode-based filtering
                match mode {
                    SearchMode::TaskForm => {
                        // Exclude ignored files for task forms
                        if indexed_file.is_ignored {
                            continue;
                        }
                    }
                    SearchMode::Settings => {
                        // Include all files (including ignored) for project settings
                        // No filtering needed
                    }
                }

                results.push(SearchResult {
                    path: indexed_file.path.clone(),
                    is_file: indexed_file.is_file,
                    match_type: indexed_file.match_type.clone(),
                });
            }
        }

        // Apply git history-based ranking
        self.file_ranker.rerank(&mut results, &cached.stats);

        // Limit to top 10 results
        results.truncate(10);
        results
    }

    /// Build cache entry for a repository
    async fn build_repo_cache(&self, repo_path: &Path) -> Result<CachedRepo, String> {
        let repo_path_buf = repo_path.to_path_buf();

        info!("Building cache for repo: {:?}", repo_path);

        // Get current HEAD
        let head_info = self
            .git_service
            .get_head_info(&repo_path_buf)
            .map_err(|e| format!("Failed to get HEAD info: {e}"))?;

        // Get git stats
        let stats = self
            .file_ranker
            .get_stats(repo_path)
            .await
            .map_err(|e| format!("Failed to get git stats: {e}"))?;

        // Build file index
        let file_index = Self::build_file_index(repo_path)
            .map_err(|e| format!("Failed to build file index: {e}"))?;

        Ok(CachedRepo {
            head_sha: head_info.oid,
            fst_index: file_index.map,
            indexed_files: file_index.files,
            stats,
            build_ts: Instant::now(),
        })
    }

    /// Build FST index from filesystem traversal using superset approach
    fn build_file_index(repo_path: &Path) -> Result<FileIndex, FileIndexError> {
        let mut indexed_files = Vec::new();
        let mut fst_keys = Vec::new();

        // Build superset walker - include ignored files but exclude .git and performance killers
        let mut builder = WalkBuilder::new(repo_path);
        builder
            .git_ignore(false) // Include all files initially
            .git_global(false)
            .git_exclude(false)
            .hidden(false) // Show hidden files like .env
            .filter_entry(|entry| {
                let name = entry.file_name().to_string_lossy();
                // Always exclude .git directories
                if name == ".git" {
                    return false;
                }
                // Exclude performance killers even when including ignored files
                if name == "node_modules" || name == "target" || name == "dist" || name == "build" {
                    return false;
                }
                true
            });

        let walker = builder.build();

        // Create a second walker for checking ignore status
        let ignore_walker = WalkBuilder::new(repo_path)
            .git_ignore(true) // This will tell us what's ignored
            .git_global(true)
            .git_exclude(true)
            .hidden(false)
            .filter_entry(|entry| {
                let name = entry.file_name().to_string_lossy();
                name != ".git"
            })
            .build();

        // Collect paths from ignore-aware walker to know what's NOT ignored
        let mut non_ignored_paths = std::collections::HashSet::new();
        for result in ignore_walker {
            if let Ok(entry) = result
                && let Ok(relative_path) = entry.path().strip_prefix(repo_path)
            {
                non_ignored_paths.insert(relative_path.to_path_buf());
            }
        }

        // Now walk all files and determine their ignore status
        for result in walker {
            let entry = result?;
            let path = entry.path();

            if path == repo_path {
                continue;
            }

            let relative_path = path.strip_prefix(repo_path)?;
            let relative_path_str = relative_path.to_string_lossy().to_string();
            let relative_path_lower = relative_path_str.to_lowercase();

            // Skip empty paths
            if relative_path_lower.is_empty() {
                continue;
            }

            // Determine if this file is ignored
            let is_ignored = !non_ignored_paths.contains(relative_path);

            let file_name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            // Determine match type
            let match_type = if !file_name.is_empty() {
                SearchMatchType::FileName
            } else if path
                .parent()
                .and_then(|p| p.file_name())
                .map(|name| name.to_string_lossy().to_lowercase())
                .unwrap_or_default()
                != relative_path_lower
            {
                SearchMatchType::DirectoryName
            } else {
                SearchMatchType::FullPath
            };

            let indexed_file = IndexedFile {
                path: relative_path_str,
                is_file: path.is_file(),
                match_type,
                path_lowercase: Arc::from(relative_path_lower.as_str()),
                is_ignored,
            };

            // Store the key for FST along with file index
            let file_index = indexed_files.len() as u64;
            fst_keys.push((relative_path_lower, file_index));
            indexed_files.push(indexed_file);
        }

        // Sort keys for FST (required for building)
        fst_keys.sort_by(|a, b| a.0.cmp(&b.0));

        // Remove duplicates (keep first occurrence)
        fst_keys.dedup_by(|a, b| a.0 == b.0);

        // Build FST
        let mut fst_builder = MapBuilder::memory();
        for (key, value) in fst_keys {
            fst_builder.insert(&key, value)?;
        }

        let fst_map = fst_builder.into_map();
        Ok(FileIndex {
            files: indexed_files,
            map: fst_map,
        })
    }

    /// Background worker for cache building
    async fn background_worker(
        mut build_receiver: mpsc::UnboundedReceiver<PathBuf>,
        cache: Cache<PathBuf, CachedRepo>,
        git_service: GitService,
        file_ranker: FileRanker,
    ) {
        while let Some(repo_path) = build_receiver.recv().await {
            let cache_builder = FileSearchCache {
                cache: cache.clone(),
                git_service: git_service.clone(),
                file_ranker: file_ranker.clone(),
                build_queue: mpsc::unbounded_channel().0, // Dummy sender
                watchers: DashMap::new(),
            };

            match cache_builder.build_repo_cache(&repo_path).await {
                Ok(cached_repo) => {
                    cache.insert(repo_path.clone(), cached_repo).await;
                    info!("Successfully cached repo: {:?}", repo_path);
                }
                Err(e) => {
                    error!("Failed to cache repo {:?}: {}", repo_path, e);
                }
            }
        }
    }

    /// Setup file watcher for repository
    pub async fn setup_watcher(&self, repo_path: &Path) -> Result<(), String> {
        let repo_path_buf = repo_path.to_path_buf();

        if self.watchers.contains_key(&repo_path_buf) {
            return Ok(()); // Already watching
        }

        let git_dir = repo_path.join(".git");
        if !git_dir.exists() {
            return Err("Not a git repository".to_string());
        }

        let build_queue = self.build_queue.clone();
        let watched_path = repo_path_buf.clone();

        let (tx, mut rx) = mpsc::unbounded_channel();

        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |res: DebounceEventResult| {
                if let Ok(events) = res {
                    for event in events {
                        // Check if any path contains HEAD file
                        for path in &event.event.paths {
                            if path.file_name().is_some_and(|name| name == "HEAD") {
                                if let Err(e) = tx.send(()) {
                                    error!("Failed to send HEAD change event: {}", e);
                                }
                                break;
                            }
                        }
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to create file watcher: {e}"))?;

        debouncer
            .watch(git_dir.join("HEAD"), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch HEAD file: {e}"))?;

        // Spawn task to handle HEAD changes
        tokio::spawn(async move {
            while rx.recv().await.is_some() {
                info!("HEAD changed for repo: {:?}", watched_path);
                if let Err(e) = build_queue.send(watched_path.clone()) {
                    error!("Failed to enqueue cache refresh: {}", e);
                }
            }
        });

        info!("Setup file watcher for repo: {:?}", repo_path);
        Ok(())
    }
}

impl Default for FileSearchCache {
    fn default() -> Self {
        Self::new()
    }
}
