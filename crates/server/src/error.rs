use axum::{
    Json,
    extract::multipart::MultipartError,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use db::models::{
    execution_process::ExecutionProcessError, project::ProjectError,
    project_repo::ProjectRepoError, repo::RepoError, scratch::ScratchError, session::SessionError,
    workspace::WorkspaceError,
};
use deployment::{DeploymentError, RemoteClientNotConfigured};
use executors::executors::ExecutorError;
use git2::Error as Git2Error;
use services::services::{
    config::{ConfigError, EditorOpenError},
    container::ContainerError,
    git::GitServiceError,
    github::GitHubServiceError,
    image::ImageError,
    project::ProjectServiceError,
    remote_client::RemoteClientError,
    repo::RepoError as RepoServiceError,
    share::ShareError,
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
    Repo(#[from] RepoError),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error(transparent)]
    ScratchError(#[from] ScratchError),
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
    #[error("Multipart error: {0}")]
    Multipart(#[from] MultipartError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    EditorOpen(#[from] EditorOpenError),
    #[error(transparent)]
    RemoteClient(#[from] RemoteClientError),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl From<&'static str> for ApiError {
    fn from(msg: &'static str) -> Self {
        ApiError::BadRequest(msg.to_string())
    }
}

impl From<Git2Error> for ApiError {
    fn from(err: Git2Error) -> Self {
        ApiError::GitService(GitServiceError::from(err))
    }
}

impl From<RemoteClientNotConfigured> for ApiError {
    fn from(_: RemoteClientNotConfigured) -> Self {
        ApiError::BadRequest("Remote client not configured".to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status_code, error_type) = match &self {
            ApiError::Project(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ProjectError"),
            ApiError::Repo(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ProjectRepoError"),
            ApiError::Workspace(_) => (StatusCode::INTERNAL_SERVER_ERROR, "WorkspaceError"),
            ApiError::Session(_) => (StatusCode::INTERNAL_SERVER_ERROR, "SessionError"),
            ApiError::ScratchError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ScratchError"),
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
            ApiError::Io(_) => (StatusCode::INTERNAL_SERVER_ERROR, "IoError"),
            ApiError::EditorOpen(err) => match err {
                EditorOpenError::LaunchFailed { .. } => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "EditorLaunchError")
                }
                _ => (StatusCode::BAD_REQUEST, "EditorOpenError"),
            },
            ApiError::Multipart(_) => (StatusCode::BAD_REQUEST, "MultipartError"),
            ApiError::RemoteClient(err) => match err {
                RemoteClientError::Auth => (StatusCode::UNAUTHORIZED, "RemoteClientError"),
                RemoteClientError::Timeout => (StatusCode::GATEWAY_TIMEOUT, "RemoteClientError"),
                RemoteClientError::Transport(_) => (StatusCode::BAD_GATEWAY, "RemoteClientError"),
                RemoteClientError::Http { status, .. } => (
                    StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY),
                    "RemoteClientError",
                ),
                RemoteClientError::Token(_) => (StatusCode::BAD_GATEWAY, "RemoteClientError"),
                RemoteClientError::Api(code) => match code {
                    services::services::remote_client::HandoffErrorCode::NotFound => {
                        (StatusCode::NOT_FOUND, "RemoteClientError")
                    }
                    services::services::remote_client::HandoffErrorCode::Expired => {
                        (StatusCode::UNAUTHORIZED, "RemoteClientError")
                    }
                    services::services::remote_client::HandoffErrorCode::AccessDenied => {
                        (StatusCode::FORBIDDEN, "RemoteClientError")
                    }
                    services::services::remote_client::HandoffErrorCode::ProviderError
                    | services::services::remote_client::HandoffErrorCode::InternalError => {
                        (StatusCode::BAD_GATEWAY, "RemoteClientError")
                    }
                    _ => (StatusCode::BAD_REQUEST, "RemoteClientError"),
                },
                RemoteClientError::Storage(_) => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "RemoteClientError")
                }
                RemoteClientError::Serde(_) | RemoteClientError::Url(_) => {
                    (StatusCode::BAD_REQUEST, "RemoteClientError")
                }
            },
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, "BadRequest"),
            ApiError::Conflict(_) => (StatusCode::CONFLICT, "ConflictError"),
            ApiError::Forbidden(_) => (StatusCode::FORBIDDEN, "ForbiddenError"),
            ApiError::NotFound(_) => (StatusCode::NOT_FOUND, "NotFoundError"),
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
            ApiError::RemoteClient(err) => match err {
                RemoteClientError::Auth => "Unauthorized. Please sign in again.".to_string(),
                RemoteClientError::Timeout => "Remote service timeout. Please try again.".to_string(),
                RemoteClientError::Transport(_) => "Remote service unavailable. Please try again.".to_string(),
                RemoteClientError::Http { body, .. } => {
                    if body.is_empty() {
                        "Remote service error. Please try again.".to_string()
                    } else {
                        body.clone()
                    }
                }
                RemoteClientError::Token(_) => {
                    "Remote service returned an invalid access token. Please sign in again.".to_string()
                }
                RemoteClientError::Storage(_) => {
                    "Failed to persist credentials locally. Please retry.".to_string()
                }
                RemoteClientError::Api(code) => match code {
                    services::services::remote_client::HandoffErrorCode::NotFound => {
                        "The requested resource was not found.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::Expired => {
                        "The link or token has expired.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::AccessDenied => {
                        "Access denied.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::UnsupportedProvider => {
                        "Unsupported authentication provider.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::InvalidReturnUrl => {
                        "Invalid return URL.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::InvalidChallenge => {
                        "Invalid authentication challenge.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::ProviderError => {
                        "Authentication provider error. Please try again.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::InternalError => {
                        "Internal remote service error. Please try again.".to_string()
                    }
                    services::services::remote_client::HandoffErrorCode::Other(msg) => {
                        format!("Authentication error: {}", msg)
                    }
                },
                RemoteClientError::Serde(_) => "Unexpected response from remote service.".to_string(),
                RemoteClientError::Url(_) => "Remote service URL is invalid.".to_string(),
            },
            ApiError::Unauthorized => "Unauthorized. Please sign in again.".to_string(),
            ApiError::BadRequest(msg) => msg.clone(),
            ApiError::Conflict(msg) => msg.clone(),
            ApiError::Forbidden(msg) => msg.clone(),
            ApiError::NotFound(msg) => msg.clone(),
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
            ShareError::ProjectNotLinked(project_id) => {
                tracing::warn!(
                    %project_id,
                    "project must be linked to a remote project before sharing tasks"
                );
                ApiError::Conflict(
                    "Link this project to a remote project before sharing tasks.".to_string(),
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
            ShareError::RemoteClientError(err) => ApiError::Conflict(err.to_string()),
        }
    }
}

impl From<ProjectServiceError> for ApiError {
    fn from(err: ProjectServiceError) -> Self {
        match err {
            ProjectServiceError::Database(db_err) => ApiError::Database(db_err),
            ProjectServiceError::Io(io_err) => ApiError::Io(io_err),
            ProjectServiceError::Project(proj_err) => ApiError::Project(proj_err),
            ProjectServiceError::Share(share_err) => ApiError::from(share_err),
            ProjectServiceError::PathNotFound(path) => {
                ApiError::BadRequest(format!("Path does not exist: {}", path.display()))
            }
            ProjectServiceError::PathNotDirectory(path) => {
                ApiError::BadRequest(format!("Path is not a directory: {}", path.display()))
            }
            ProjectServiceError::NotGitRepository(path) => {
                ApiError::BadRequest(format!("Path is not a git repository: {}", path.display()))
            }
            ProjectServiceError::DuplicateGitRepoPath => ApiError::Conflict(
                "A project with this git repository path already exists".to_string(),
            ),
            ProjectServiceError::DuplicateRepositoryName => ApiError::Conflict(
                "A repository with this name already exists in the project".to_string(),
            ),
            ProjectServiceError::RepositoryNotFound => {
                ApiError::BadRequest("Repository not found".to_string())
            }
            ProjectServiceError::GitError(msg) => {
                ApiError::BadRequest(format!("Git operation failed: {}", msg))
            }
            ProjectServiceError::RemoteClient(msg) => {
                ApiError::BadRequest(format!("Remote client error: {}", msg))
            }
        }
    }
}

impl From<RepoServiceError> for ApiError {
    fn from(err: RepoServiceError) -> Self {
        match err {
            RepoServiceError::Database(db_err) => ApiError::Database(db_err),
            RepoServiceError::Io(io_err) => ApiError::Io(io_err),
            RepoServiceError::PathNotFound(path) => {
                ApiError::BadRequest(format!("Path does not exist: {}", path.display()))
            }
            RepoServiceError::PathNotDirectory(path) => {
                ApiError::BadRequest(format!("Path is not a directory: {}", path.display()))
            }
            RepoServiceError::NotGitRepository(path) => {
                ApiError::BadRequest(format!("Path is not a git repository: {}", path.display()))
            }
            RepoServiceError::NotFound => ApiError::BadRequest("Repository not found".to_string()),
            RepoServiceError::DirectoryAlreadyExists(path) => {
                ApiError::BadRequest(format!("Directory already exists: {}", path.display()))
            }
            RepoServiceError::Git(git_err) => {
                ApiError::BadRequest(format!("Git error: {}", git_err))
            }
            RepoServiceError::InvalidFolderName(name) => {
                ApiError::BadRequest(format!("Invalid folder name: {}", name))
            }
        }
    }
}

impl From<ProjectRepoError> for ApiError {
    fn from(err: ProjectRepoError) -> Self {
        match err {
            ProjectRepoError::Database(db_err) => ApiError::Database(db_err),
            ProjectRepoError::NotFound => {
                ApiError::BadRequest("Repository not found in project".to_string())
            }
            ProjectRepoError::AlreadyExists => {
                ApiError::Conflict("Repository already exists in project".to_string())
            }
        }
    }
}
