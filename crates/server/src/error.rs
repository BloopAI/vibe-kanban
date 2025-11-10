use axum::{
    Json,
    extract::multipart::MultipartError,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use db::models::{
    execution_process::ExecutionProcessError, project::ProjectError, task_attempt::TaskAttemptError,
};
use deployment::DeploymentError;
use executors::executors::ExecutorError;
use git2::Error as Git2Error;
use services::services::{
    config::ConfigError, container::ContainerError, drafts::DraftsServiceError,
    git::GitServiceError, github_service::GitHubServiceError, image::ImageError, share::ShareError,
    worktree_manager::WorktreeError,
};
use thiserror::Error;
use utils::response::ApiResponse;

#[derive(Debug, Error, ts_rs::TS)]
#[ts(type = "string")]
pub enum ApiError {
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error(transparent)]
    TaskAttempt(#[from] TaskAttemptError),
    #[error(transparent)]
    ExecutionProcess(#[from] ExecutionProcessError),
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[error(transparent)]
    GitHubService(#[from] GitHubServiceError),
    #[error(transparent)]
    Deployment(#[from] DeploymentError),
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error(transparent)]
    Executor(#[from] ExecutorError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    Image(#[from] ImageError),
    #[error(transparent)]
    Drafts(#[from] DraftsServiceError),
    #[error("Multipart error: {0}")]
    Multipart(#[from] MultipartError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
}

impl From<Git2Error> for ApiError {
    fn from(err: Git2Error) -> Self {
        ApiError::GitService(GitServiceError::from(err))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status_code, error_type) = match &self {
            ApiError::Project(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ProjectError"),
            ApiError::TaskAttempt(_) => (StatusCode::INTERNAL_SERVER_ERROR, "TaskAttemptError"),
            ApiError::ExecutionProcess(err) => match err {
                ExecutionProcessError::ExecutionProcessNotFound => {
                    (StatusCode::NOT_FOUND, "ExecutionProcessError")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "ExecutionProcessError"),
            },
            // Promote certain GitService errors to conflict status with concise messages
            ApiError::GitService(git_err) => match git_err {
                services::services::git::GitServiceError::MergeConflicts(_) => {
                    (StatusCode::CONFLICT, "GitServiceError")
                }
                services::services::git::GitServiceError::RebaseInProgress => {
                    (StatusCode::CONFLICT, "GitServiceError")
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "GitServiceError"),
            },
            ApiError::GitHubService(_) => (StatusCode::INTERNAL_SERVER_ERROR, "GitHubServiceError"),
            ApiError::Deployment(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DeploymentError"),
            ApiError::Container(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ContainerError"),
            ApiError::Executor(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ExecutorError"),
            ApiError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DatabaseError"),
            ApiError::Worktree(_) => (StatusCode::INTERNAL_SERVER_ERROR, "WorktreeError"),
            ApiError::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ConfigError"),
            ApiError::Image(img_err) => match img_err {
                ImageError::InvalidFormat => (StatusCode::BAD_REQUEST, "InvalidImageFormat"),
                ImageError::TooLarge(_, _) => (StatusCode::PAYLOAD_TOO_LARGE, "ImageTooLarge"),
                ImageError::NotFound => (StatusCode::NOT_FOUND, "ImageNotFound"),
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "ImageError"),
            },
            ApiError::Drafts(drafts_err) => match drafts_err {
                DraftsServiceError::Conflict(_) => (StatusCode::CONFLICT, "ConflictError"),
                DraftsServiceError::Database(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "DatabaseError")
                }
                DraftsServiceError::Container(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "ContainerError")
                }
                DraftsServiceError::Image(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ImageError"),
                DraftsServiceError::ExecutionProcess(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "ExecutionProcessError")
                }
            },
            ApiError::Io(_) => (StatusCode::INTERNAL_SERVER_ERROR, "IoError"),
            ApiError::Multipart(_) => (StatusCode::BAD_REQUEST, "MultipartError"),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            ApiError::Conflict(_) => (StatusCode::CONFLICT, "ConflictError"),
            ApiError::Forbidden(_) => (StatusCode::FORBIDDEN, "ForbiddenError"),
        };

        let error_message = match &self {
            ApiError::Image(img_err) => match img_err {
                ImageError::InvalidFormat => "This file type is not supported. Please upload an image file (PNG, JPG, GIF, WebP, or BMP).".to_string(),
                ImageError::TooLarge(size, max) => format!(
                    "This image is too large ({:.1} MB). Maximum file size is {:.1} MB.",
                    *size as f64 / 1_048_576.0,
                    *max as f64 / 1_048_576.0
                ),
                ImageError::NotFound => "Image not found.".to_string(),
                _ => {
                    "Failed to process image. Please try again.".to_string()
                }
            },
            ApiError::GitService(git_err) => match git_err {
                services::services::git::GitServiceError::MergeConflicts(msg) => msg.clone(),
                services::services::git::GitServiceError::RebaseInProgress => {
                    "A rebase is already in progress. Resolve conflicts or abort the rebase, then retry.".to_string()
                }
                _ => format!("{}: {}", error_type, self),
            },
            ApiError::Multipart(_) => "Failed to upload file. Please ensure the file is valid and try again.".to_string(),
            ApiError::Unauthorized => "Unauthorized. Please sign in again.".to_string(),
            ApiError::Conflict(msg) => msg.clone(),
            ApiError::Forbidden(msg) => msg.clone(),
            ApiError::Drafts(drafts_err) => match drafts_err {
                DraftsServiceError::Conflict(msg) => msg.clone(),
                DraftsServiceError::Database(_) => format!("{}: {}", error_type, drafts_err),
                DraftsServiceError::Container(_) => format!("{}: {}", error_type, drafts_err),
                DraftsServiceError::Image(_) => format!("{}: {}", error_type, drafts_err),
                DraftsServiceError::ExecutionProcess(_) => {
                    format!("{}: {}", error_type, drafts_err)
                }
            },
            _ => format!("{}: {}", error_type, self),
        };
        let response = ApiResponse::<()>::error(&error_message);
        (status_code, Json(response)).into_response()
    }
}

impl From<ShareError> for ApiError {
    fn from(err: ShareError) -> Self {
        match err {
            ShareError::Database(db_err) => ApiError::Database(db_err),
            ShareError::AlreadyShared(_) => ApiError::Conflict("Task already shared".to_string()),
            ShareError::TaskNotFound(_) => {
                ApiError::Conflict("Task not found for sharing".to_string())
            }
            ShareError::ProjectNotFound(_) => {
                ApiError::Conflict("Project not found for sharing".to_string())
            }
            ShareError::MissingProjectMetadata(project_id) => {
                tracing::warn!(
                    %project_id,
                    "project missing GitHub metadata required for sharing"
                );
                ApiError::Conflict(
                    "This project needs a linked GitHub repository before tasks can be shared. Open the project settings, connect GitHub, and try again."
                        .to_string(),
                )
            }
            ShareError::MissingConfig(reason) => {
                ApiError::Conflict(format!("Share service not configured: {reason}"))
            }
            ShareError::Transport(err) => {
                tracing::error!(?err, "share task transport error");
                ApiError::Conflict("Failed to share task with remote service".to_string())
            }
            ShareError::Serialization(err) => {
                tracing::error!(?err, "share task serialization error");
                ApiError::Conflict("Failed to parse remote share response".to_string())
            }
            ShareError::Url(err) => {
                tracing::error!(?err, "share task URL error");
                ApiError::Conflict("Share service URL is invalid".to_string())
            }
            ShareError::WebSocket(err) => {
                tracing::error!(?err, "share task websocket error");
                ApiError::Conflict("Unexpected websocket error during sharing".to_string())
            }
            ShareError::InvalidResponse => ApiError::Conflict(
                "Remote share service returned an unexpected response".to_string(),
            ),
            ShareError::MissingGitHubToken => ApiError::Conflict(
                "GitHub token is required to fetch repository metadata for sharing".to_string(),
            ),
            ShareError::Git(err) => ApiError::GitService(err),
            ShareError::GitHub(err) => ApiError::GitHubService(err),
            ShareError::MissingAuth => ApiError::Unauthorized,
            ShareError::InvalidUserId => ApiError::Conflict("Invalid user ID format".to_string()),
            ShareError::InvalidOrganizationId => {
                ApiError::Conflict("Invalid organization ID format".to_string())
            }
        }
    }
}
