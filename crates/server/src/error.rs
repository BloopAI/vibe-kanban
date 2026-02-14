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
use executors::{command::CommandBuildError, executors::ExecutorError};
use git::GitServiceError;
use git2::Error as Git2Error;
use local_deployment::pty::PtyError;
use services::services::{
    config::{ConfigError, EditorOpenError},
    container::ContainerError,
    git_host::GitHostError,
    image::ImageError,
    migration::MigrationError,
    project::ProjectServiceError,
    remote_client::RemoteClientError,
    repo::RepoError as RepoServiceError,
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
    GitHost(#[from] GitHostError),
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
    #[error(transparent)]
    CommandBuilder(#[from] CommandBuildError),
    #[error(transparent)]
    Pty(#[from] PtyError),
    #[error(transparent)]
    Migration(#[from] MigrationError),
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

struct ErrorInfo {
    status: StatusCode,
    error_type: &'static str,
    message: Option<String>,
}

impl ErrorInfo {
    fn internal(error_type: &'static str) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error_type,
            message: Some("An internal error occurred. Please try again.".into()),
        }
    }

    fn not_found(error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            error_type,
            message: Some(msg.into()),
        }
    }

    fn bad_request(error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            error_type,
            message: Some(msg.into()),
        }
    }

    fn conflict(error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            error_type,
            message: Some(msg.into()),
        }
    }

    fn with_status(status: StatusCode, error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status,
            error_type,
            message: Some(msg.into()),
        }
    }
}

fn remote_client_error(err: &RemoteClientError) -> ErrorInfo {
    use services::services::remote_client::HandoffErrorCode;
    match err {
        RemoteClientError::Auth => ErrorInfo::with_status(
            StatusCode::UNAUTHORIZED,
            "RemoteClientError",
            "Unauthorized. Please sign in again.",
        ),
        RemoteClientError::Timeout => ErrorInfo::with_status(
            StatusCode::GATEWAY_TIMEOUT,
            "RemoteClientError",
            "Remote service timeout. Please try again.",
        ),
        RemoteClientError::TokenRefreshTimeout => ErrorInfo::with_status(
            StatusCode::UNAUTHORIZED,
            "RemoteClientError",
            "Remote service timeout during token refresh. Please sign in again.",
        ),
        RemoteClientError::Transport(_) => ErrorInfo::with_status(
            StatusCode::BAD_GATEWAY,
            "RemoteClientError",
            "Remote service unavailable. Please try again.",
        ),
        RemoteClientError::Http { status, body } => {
            let msg = if body.is_empty() {
                "Remote service error. Please try again.".into()
            } else {
                serde_json::from_str::<serde_json::Value>(body)
                    .ok()
                    .and_then(|v| v.get("error")?.as_str().map(String::from))
                    .unwrap_or_else(|| body.clone())
            };
            ErrorInfo::with_status(
                StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY),
                "RemoteClientError",
                msg,
            )
        }
        RemoteClientError::Token(_) => ErrorInfo::with_status(
            StatusCode::BAD_GATEWAY,
            "RemoteClientError",
            "Remote service returned an invalid access token. Please sign in again.",
        ),
        RemoteClientError::Storage(_) => ErrorInfo {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error_type: "RemoteClientError",
            message: Some("Failed to persist credentials locally. Please retry.".into()),
        },
        RemoteClientError::Api(code) => {
            let (status, msg) = match code {
                HandoffErrorCode::NotFound => (
                    StatusCode::NOT_FOUND,
                    "The requested resource was not found.",
                ),
                HandoffErrorCode::Expired => {
                    (StatusCode::UNAUTHORIZED, "The link or token has expired.")
                }
                HandoffErrorCode::AccessDenied => (StatusCode::FORBIDDEN, "Access denied."),
                HandoffErrorCode::UnsupportedProvider => (
                    StatusCode::BAD_REQUEST,
                    "Unsupported authentication provider.",
                ),
                HandoffErrorCode::InvalidReturnUrl => {
                    (StatusCode::BAD_REQUEST, "Invalid return URL.")
                }
                HandoffErrorCode::InvalidChallenge => {
                    (StatusCode::BAD_REQUEST, "Invalid authentication challenge.")
                }
                HandoffErrorCode::ProviderError => (
                    StatusCode::BAD_GATEWAY,
                    "Authentication provider error. Please try again.",
                ),
                HandoffErrorCode::InternalError => (
                    StatusCode::BAD_GATEWAY,
                    "Internal remote service error. Please try again.",
                ),
                HandoffErrorCode::Other(m) => {
                    return ErrorInfo::bad_request(
                        "RemoteClientError",
                        format!("Authentication error: {}", m),
                    );
                }
            };
            ErrorInfo::with_status(status, "RemoteClientError", msg)
        }
        RemoteClientError::Serde(_) => ErrorInfo::bad_request(
            "RemoteClientError",
            "Unexpected response from remote service.",
        ),
        RemoteClientError::Url(_) => {
            ErrorInfo::bad_request("RemoteClientError", "Remote service URL is invalid.")
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let info = match &self {
            ApiError::Project(ProjectError::Database(_)) => ErrorInfo::internal("ProjectError"),
            ApiError::Project(ProjectError::ProjectNotFound) => {
                ErrorInfo::not_found("ProjectError", "Project not found.")
            }
            ApiError::Project(ProjectError::CreateFailed(_)) => ErrorInfo::internal("ProjectError"),

            ApiError::Repo(RepoError::Database(_)) => ErrorInfo::internal("RepoError"),
            ApiError::Repo(RepoError::NotFound) => {
                ErrorInfo::not_found("RepoError", "Repository not found.")
            }

            ApiError::Workspace(WorkspaceError::Database(_)) => {
                ErrorInfo::internal("WorkspaceError")
            }
            ApiError::Workspace(WorkspaceError::TaskNotFound) => {
                ErrorInfo::not_found("WorkspaceError", "Task not found.")
            }
            ApiError::Workspace(WorkspaceError::ProjectNotFound) => {
                ErrorInfo::not_found("WorkspaceError", "Project not found.")
            }
            ApiError::Workspace(WorkspaceError::ValidationError(msg)) => {
                ErrorInfo::bad_request("WorkspaceError", msg.clone())
            }
            ApiError::Workspace(WorkspaceError::BranchNotFound(branch)) => {
                ErrorInfo::not_found("WorkspaceError", format!("Branch '{}' not found.", branch))
            }

            ApiError::Session(SessionError::Database(_)) => ErrorInfo::internal("SessionError"),
            ApiError::Session(SessionError::NotFound) => {
                ErrorInfo::not_found("SessionError", "Session not found.")
            }
            ApiError::Session(SessionError::WorkspaceNotFound) => {
                ErrorInfo::not_found("SessionError", "Workspace not found.")
            }
            ApiError::Session(SessionError::ExecutorMismatch { expected, actual }) => {
                ErrorInfo::conflict(
                    "SessionError",
                    format!(
                        "Executor mismatch: session uses {} but request specified {}.",
                        expected, actual
                    ),
                )
            }

            ApiError::ScratchError(ScratchError::Database(_)) => {
                ErrorInfo::internal("ScratchError")
            }
            ApiError::ScratchError(ScratchError::Serde(_)) => {
                ErrorInfo::bad_request("ScratchError", "Invalid scratch data format.")
            }
            ApiError::ScratchError(ScratchError::TypeMismatch { expected, actual }) => {
                ErrorInfo::bad_request(
                    "ScratchError",
                    format!(
                        "Scratch type mismatch: expected '{}' but got '{}'.",
                        expected, actual
                    ),
                )
            }

            ApiError::ExecutionProcess(ExecutionProcessError::ExecutionProcessNotFound) => {
                ErrorInfo::not_found("ExecutionProcessError", "Execution process not found.")
            }
            ApiError::ExecutionProcess(_) => ErrorInfo::internal("ExecutionProcessError"),

            ApiError::GitService(git::GitServiceError::MergeConflicts { message, .. }) => {
                ErrorInfo::conflict("GitServiceError", message.clone())
            }
            ApiError::GitService(git::GitServiceError::RebaseInProgress) => ErrorInfo::conflict(
                "GitServiceError",
                "A rebase is already in progress. Resolve conflicts or abort the rebase, then retry.",
            ),
            ApiError::GitService(git::GitServiceError::BranchNotFound(branch)) => {
                ErrorInfo::not_found(
                    "GitServiceError",
                    format!(
                        "Branch '{}' not found. Try changing the target branch.",
                        branch
                    ),
                )
            }
            ApiError::GitService(git::GitServiceError::BranchesDiverged(msg)) => {
                ErrorInfo::conflict(
                    "GitServiceError",
                    format!(
                        "{} Rebase onto the target branch first, then retry the merge.",
                        msg
                    ),
                )
            }
            ApiError::GitService(git::GitServiceError::WorktreeDirty(branch, files)) => {
                ErrorInfo::conflict(
                    "GitServiceError",
                    format!(
                        "Branch '{}' has uncommitted changes ({}). Commit or revert them before retrying.",
                        branch, files
                    ),
                )
            }
            ApiError::GitService(git::GitServiceError::GitCLI(git::GitCliError::AuthFailed(
                msg,
            ))) => ErrorInfo::with_status(
                StatusCode::UNAUTHORIZED,
                "GitServiceError",
                format!(
                    "{}. Check your git credentials or SSH keys and try again.",
                    msg
                ),
            ),
            ApiError::GitService(e) => ErrorInfo::with_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                "GitServiceError",
                format!("Git operation failed: {}", e),
            ),
            ApiError::GitHost(_) => ErrorInfo::internal("GitHostError"),

            ApiError::Image(ImageError::InvalidFormat) => ErrorInfo::bad_request(
                "InvalidImageFormat",
                "This file type is not supported. Please upload an image file (PNG, JPG, GIF, WebP, or BMP).",
            ),
            ApiError::Image(ImageError::TooLarge(size, max)) => ErrorInfo::with_status(
                StatusCode::PAYLOAD_TOO_LARGE,
                "ImageTooLarge",
                format!(
                    "This image is too large ({:.1} MB). Maximum file size is {:.1} MB.",
                    *size as f64 / 1_048_576.0,
                    *max as f64 / 1_048_576.0
                ),
            ),
            ApiError::Image(ImageError::NotFound) => {
                ErrorInfo::not_found("ImageNotFound", "Image not found.")
            }
            ApiError::Image(_) => ErrorInfo {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                error_type: "ImageError",
                message: Some("Failed to process image. Please try again.".into()),
            },

            ApiError::EditorOpen(EditorOpenError::LaunchFailed { .. }) => {
                ErrorInfo::internal("EditorLaunchError")
            }
            ApiError::EditorOpen(_) => {
                ErrorInfo::bad_request("EditorOpenError", format!("{}", self))
            }

            ApiError::RemoteClient(err) => remote_client_error(err),

            ApiError::Pty(PtyError::SessionNotFound(_)) => {
                ErrorInfo::not_found("PtyError", "PTY session not found.")
            }
            ApiError::Pty(PtyError::SessionClosed) => {
                ErrorInfo::with_status(StatusCode::GONE, "PtyError", "PTY session closed.")
            }
            ApiError::Pty(_) => ErrorInfo::internal("PtyError"),

            ApiError::Unauthorized => ErrorInfo::with_status(
                StatusCode::UNAUTHORIZED,
                "Unauthorized",
                "Unauthorized. Please sign in again.",
            ),
            ApiError::BadRequest(msg) => ErrorInfo::bad_request("BadRequest", msg.clone()),
            ApiError::Conflict(msg) => ErrorInfo::conflict("ConflictError", msg.clone()),
            ApiError::Forbidden(msg) => {
                ErrorInfo::with_status(StatusCode::FORBIDDEN, "ForbiddenError", msg.clone())
            }
            ApiError::Multipart(_) => ErrorInfo::bad_request(
                "MultipartError",
                "Failed to upload file. Please ensure the file is valid and try again.",
            ),

            ApiError::Deployment(_) => ErrorInfo::internal("DeploymentError"),
            ApiError::Container(_) => ErrorInfo::internal("ContainerError"),
            ApiError::Executor(_) => ErrorInfo::internal("ExecutorError"),
            ApiError::CommandBuilder(_) => ErrorInfo::internal("CommandBuildError"),
            ApiError::Database(_) => ErrorInfo::internal("DatabaseError"),
            ApiError::Worktree(_) => ErrorInfo::internal("WorktreeError"),
            ApiError::Config(_) => ErrorInfo::internal("ConfigError"),
            ApiError::Io(_) => ErrorInfo::internal("IoError"),
            ApiError::Migration(MigrationError::Database(_)) => {
                ErrorInfo::internal("MigrationError")
            }
            ApiError::Migration(MigrationError::MigrationState(_)) => {
                ErrorInfo::internal("MigrationError")
            }
            ApiError::Migration(MigrationError::Workspace(_)) => {
                ErrorInfo::internal("MigrationError")
            }
            ApiError::Migration(MigrationError::RemoteClient(err)) => remote_client_error(err),
            ApiError::Migration(MigrationError::NotAuthenticated) => ErrorInfo::with_status(
                StatusCode::UNAUTHORIZED,
                "MigrationError",
                "Not authenticated - please log in first.",
            ),
            ApiError::Migration(MigrationError::OrganizationNotFound) => {
                ErrorInfo::not_found("MigrationError", "Organization not found for user.")
            }
            ApiError::Migration(MigrationError::EntityNotFound { entity_type, id }) => {
                ErrorInfo::not_found(
                    "MigrationError",
                    format!("Entity not found: {} with id {}", entity_type, id),
                )
            }
            ApiError::Migration(MigrationError::MigrationInProgress) => {
                ErrorInfo::conflict("MigrationError", "Migration already in progress.")
            }
            ApiError::Migration(MigrationError::StatusMappingFailed(status)) => {
                ErrorInfo::bad_request(
                    "MigrationError",
                    format!("Status mapping failed: unknown status '{}'", status),
                )
            }
            ApiError::Migration(MigrationError::BrokenReferenceChain(msg)) => {
                ErrorInfo::bad_request("MigrationError", format!("Broken reference chain: {}", msg))
            }
            ApiError::Migration(MigrationError::RemoteError(msg)) => ErrorInfo::with_status(
                StatusCode::BAD_GATEWAY,
                "MigrationError",
                format!("Remote error: {}", msg),
            ),
        };

        let message = info
            .message
            .unwrap_or_else(|| format!("{}: {}", info.error_type, self));
        let response = ApiResponse::<()>::error(&message);
        (info.status, Json(response)).into_response()
    }
}

impl From<ProjectServiceError> for ApiError {
    fn from(err: ProjectServiceError) -> Self {
        match err {
            ProjectServiceError::Database(db_err) => ApiError::Database(db_err),
            ProjectServiceError::Io(io_err) => ApiError::Io(io_err),
            ProjectServiceError::Project(proj_err) => ApiError::Project(proj_err),
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
