use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use ignore::WalkBuilder;
use serde::Serialize;
use thiserror::Error;
use ts_rs::TS;
#[derive(Clone)]
pub struct FilesystemService {}

#[derive(Debug, Error)]
pub enum FilesystemError {
    #[error("Directory does not exist")]
    DirectoryDoesNotExist,
    #[error("Path is not a directory")]
    PathIsNotDirectory,
    #[error("Failed to read directory: {0}")]
    Io(#[from] std::io::Error),
}
#[derive(Debug, Serialize, TS)]
pub struct DirectoryListResponse {
    pub entries: Vec<DirectoryEntry>,
    pub current_path: String,
}

#[derive(Debug, Serialize, TS)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_git_repo: bool,
    pub last_modified: Option<u64>,
}

impl Default for FilesystemService {
    fn default() -> Self {
        Self::new()
    }
}

impl FilesystemService {
    pub fn new() -> Self {
        FilesystemService {}
    }

    fn get_directories_to_skip() -> HashSet<String> {
        let mut skip_dirs = HashSet::from(
            [
                "node_modules",
                "target",
                "build",
                "dist",
                ".next",
                ".nuxt",
                ".cache",
                ".npm",
                ".yarn",
                ".pnpm-store",
                "Library",
                "AppData",
                "Applications",
            ]
            .map(String::from),
        );

        [
            dirs::executable_dir(),
            dirs::data_dir(),
            dirs::download_dir(),
            dirs::picture_dir(),
            dirs::video_dir(),
            dirs::audio_dir(),
        ]
        .into_iter()
        .flatten()
        .filter_map(|path| path.file_name()?.to_str().map(String::from))
        .for_each(|name| {
            skip_dirs.insert(name);
        });

        skip_dirs
    }

    pub async fn list_git_repos(
        &self,
        path: Option<String>,
        max_depth: Option<usize>,
    ) -> Result<Vec<DirectoryEntry>, FilesystemError> {
        let base_path = path
            .map(PathBuf::from)
            .unwrap_or_else(Self::get_home_directory);
        Self::verify_directory(&base_path)?;
        let skip_dirs = Self::get_directories_to_skip();
        let mut git_repos: Vec<DirectoryEntry> = WalkBuilder::new(&base_path)
            .follow_links(false)
            .hidden(true) // true to skip hidden files
            .git_ignore(true)
            .filter_entry({
                move |entry| {
                    let path = entry.path();
                    if !path.is_dir() {
                        return false;
                    }

                    // Skip common non-git folders
                    if let Some(name) = path.file_name().and_then(|n| n.to_str())
                        && skip_dirs.contains(name)
                    {
                        return false;
                    }

                    true
                }
            })
            .max_depth(max_depth)
            .git_exclude(true)
            .build()
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let name = entry.file_name().to_str()?;
                if !entry.path().join(".git").exists() {
                    return None;
                }
                let last_modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| t.elapsed().unwrap_or_default().as_secs());
                Some(DirectoryEntry {
                    name: name.to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_directory: true,
                    is_git_repo: true,
                    last_modified,
                })
            })
            .collect();
        git_repos.sort_by_key(|entry| entry.last_modified.unwrap_or(0));
        Ok(git_repos)
    }

    fn get_home_directory() -> PathBuf {
        dirs::home_dir()
            .or_else(dirs::desktop_dir)
            .or_else(dirs::document_dir)
            .unwrap_or_else(|| {
                if cfg!(windows) {
                    std::env::var("USERPROFILE")
                        .map(PathBuf::from)
                        .unwrap_or_else(|_| PathBuf::from("C:\\"))
                } else {
                    PathBuf::from("/")
                }
            })
    }

    fn verify_directory(path: &Path) -> Result<(), FilesystemError> {
        if !path.exists() {
            return Err(FilesystemError::DirectoryDoesNotExist);
        }
        if !path.is_dir() {
            return Err(FilesystemError::PathIsNotDirectory);
        }
        Ok(())
    }

    pub async fn list_directory(
        &self,
        path: Option<String>,
    ) -> Result<DirectoryListResponse, FilesystemError> {
        let path = path
            .map(PathBuf::from)
            .unwrap_or_else(Self::get_home_directory);
        Self::verify_directory(&path)?;

        let entries = fs::read_dir(&path)?;
        let mut directory_entries = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = entry.metadata().ok();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                // Skip hidden files/directories
                if name.starts_with('.') && name != ".." {
                    continue;
                }

                let is_directory = metadata.is_some_and(|m| m.is_dir());
                let is_git_repo = if is_directory {
                    path.join(".git").exists()
                } else {
                    false
                };

                directory_entries.push(DirectoryEntry {
                    name: name.to_string(),
                    path: path.to_string_lossy().to_string(),
                    is_directory,
                    is_git_repo,
                    last_modified: None,
                });
            }
        }
        // Sort: directories first, then files, both alphabetically
        directory_entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(DirectoryListResponse {
            entries: directory_entries,
            current_path: path.to_string_lossy().to_string(),
        })
    }
}
