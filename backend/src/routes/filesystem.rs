use std::{
    fs,
    path::{Path, PathBuf},
};

use axum::{
    extract::Query, http::StatusCode, response::Json as ResponseJson, routing::get, Router,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{app_state::AppState, models::ApiResponse};

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_git_repo: bool,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct DirectoryListResponse {
    pub entries: Vec<DirectoryEntry>,
    pub current_path: String,
}

#[derive(Debug, Deserialize)]
pub struct ListDirectoryQuery {
    path: Option<String>,
}

pub async fn list_directory(
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<DirectoryListResponse>>, StatusCode> {
    let path_str = query.path.unwrap_or_else(|| {
        // Default to user's home directory
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
            .to_string_lossy()
            .to_string()
    });

    let path = Path::new(&path_str);

    if !path.exists() {
        return Ok(ResponseJson(ApiResponse::error("Directory does not exist")));
    }

    if !path.is_dir() {
        return Ok(ResponseJson(ApiResponse::error("Path is not a directory")));
    }

    match fs::read_dir(path) {
        Ok(entries) => {
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
                    });
                }
            }

            // Sort: directories first, then files, both alphabetically
            directory_entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            });

            Ok(ResponseJson(ApiResponse::success(DirectoryListResponse {
                entries: directory_entries,
                current_path: path.to_string_lossy().to_string(),
            })))
        }
        Err(e) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
    }
}

pub async fn validate_git_path(
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<bool>>, StatusCode> {
    let path_str = query.path.ok_or(StatusCode::BAD_REQUEST)?;
    let path = Path::new(&path_str);

    // Check if path exists and is a git repo
    let is_valid_git_repo = path.exists() && path.is_dir() && path.join(".git").exists();

    Ok(ResponseJson(ApiResponse::success(is_valid_git_repo)))
}

pub async fn create_git_repo(
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    let path_str = query.path.ok_or(StatusCode::BAD_REQUEST)?;
    let path = Path::new(&path_str);

    // Create directory if it doesn't exist
    if !path.exists() {
        if let Err(e) = fs::create_dir_all(path) {
            tracing::error!("Failed to create directory: {}", e);
            return Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to create directory: {}",
                e
            ))));
        }
    }

    // Check if it's already a git repo
    if path.join(".git").exists() {
        return Ok(ResponseJson(ApiResponse::success(())));
    }

    // Initialize git repository
    match std::process::Command::new("git")
        .arg("init")
        .current_dir(path)
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                Ok(ResponseJson(ApiResponse::success(())))
            } else {
                let error_msg = String::from_utf8_lossy(&output.stderr);
                tracing::error!("Git init failed: {}", error_msg);
                Ok(ResponseJson(ApiResponse::error(&format!(
                    "Git init failed: {}",
                    error_msg
                ))))
            }
        }
        Err(e) => {
            tracing::error!("Failed to run git init: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to run git init: {}",
                e
            ))))
        }
    }
}

pub fn filesystem_router() -> Router<AppState> {
    Router::new()
        .route("/filesystem/list", get(list_directory))
        .route("/filesystem/validate-git", get(validate_git_path))
        .route("/filesystem/create-git", get(create_git_repo))
}
