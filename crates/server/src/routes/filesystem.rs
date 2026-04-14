use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::filesystem::{
    DirectoryEntry, DirectoryListResponse, FileContentResponse, FilesystemError,
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListDirectoryQuery {
    path: Option<String>,
}

pub async fn list_directory(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<DirectoryListResponse>>, ApiError> {
    match deployment.filesystem().list_directory(query.path).await {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
        Err(e) => {
            tracing::error!("Unexpected error listing directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

pub async fn list_git_repos(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<DirectoryEntry>>>, ApiError> {
    let res = if let Some(ref path) = query.path {
        deployment
            .filesystem()
            .list_git_repos(Some(path.clone()), 800, 1200, Some(3))
            .await
    } else {
        deployment
            .filesystem()
            .list_common_git_repos(800, 1200, Some(4))
            .await
    };
    match res {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
        Err(e) => {
            tracing::error!("Unexpected error listing git repos: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

/// Query parameters for reading a file at any absolute path
#[derive(Debug, Deserialize)]
pub struct ReadFileQuery {
    path: String,
}

/// Read a file at any absolute path on the filesystem.
///
/// Consistent with the existing `/api/filesystem/directory` endpoint which also
/// accepts arbitrary paths — this is a local tool reading the user's own files.
pub async fn read_file(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ReadFileQuery>,
) -> Result<ResponseJson<ApiResponse<FileContentResponse>>, ApiError> {
    let path = std::path::Path::new(&query.path);
    if !path.is_absolute() {
        return Err(ApiError::BadRequest("Path must be absolute".into()));
    }
    match deployment.filesystem().read_file_absolute(path, None).await {
        Ok(r) => Ok(ResponseJson(ApiResponse::success(r))),
        Err(FilesystemError::FileDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("File does not exist")))
        }
        Err(FilesystemError::PathIsNotFile) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a file")))
        }
        Err(FilesystemError::FileIsBinary) => {
            Ok(ResponseJson(ApiResponse::error("Cannot display binary file")))
        }
        Err(FilesystemError::FileTooLarge {
            max_bytes,
            actual_bytes,
        }) => Ok(ResponseJson(ApiResponse::error(&format!(
            "File too large ({} bytes, max {} bytes)",
            actual_bytes, max_bytes
        )))),
        Err(e) => {
            tracing::error!("Failed to read file: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

/// Query parameters for reading a file from ~/.claude/ directory
#[derive(Debug, Deserialize)]
pub struct ReadClaudeFileQuery {
    /// Relative path within ~/.claude/ (e.g., "plans/my-plan.md")
    path: String,
}

/// Read a file from ~/.claude/ directory
///
/// This endpoint is security-restricted to only allow reading files
/// within the user's ~/.claude/ directory to prevent arbitrary file access.
pub async fn read_claude_file(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ReadClaudeFileQuery>,
) -> Result<ResponseJson<ApiResponse<FileContentResponse>>, ApiError> {
    match deployment
        .filesystem()
        .read_file_claude_dir(&query.path, None)
        .await
    {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::FileDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("File does not exist")))
        }
        Err(FilesystemError::PathTraversalNotAllowed) => Ok(ResponseJson(ApiResponse::error(
            "Path must be within ~/.claude/",
        ))),
        Err(e) => {
            tracing::error!("Failed to read claude file: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e.to_string())))
        }
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/filesystem/directory", get(list_directory))
        .route("/filesystem/git-repos", get(list_git_repos))
        .route("/filesystem/claude-file", get(read_claude_file))
        .route("/filesystem/file", get(read_file))
}
