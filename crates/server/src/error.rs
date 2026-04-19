use axum::{
    Json,
    extract::multipart::MultipartError,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use db::models::{
    execution_process::ExecutionProcessError, repo::RepoError, scratch::ScratchError,
    session::SessionError, workspace::WorkspaceError,
};
use deployment::DeploymentError;
use executors::{command::CommandBuildError, executors::ExecutorError};
use git::GitServiceError;
use git_host::GitHostError;
use local_deployment::pty::PtyError;
use services::services::{
    config::{ConfigError, EditorOpenError},
    container::ContainerError,
    file::FileError,
    repo::RepoError as RepoServiceError,
};
use thiserror::Error;
use trusted_key_auth::error::TrustedKeyAuthError;
use utils::response::ApiResponse;
use workspace_manager::WorkspaceError as WorkspaceManagerError;
use worktree_manager::WorktreeError;

#[derive(Debug, Error, ts_rs::TS)]
#[ts(type = "string")]
pub enum ApiError {
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
    Container(ContainerError),
    #[error(transparent)]
    Executor(#[from] ExecutorError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Worktree(WorktreeError),
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    File(#[from] FileError),
    #[error("Multipart error: {0}")]
    Multipart(#[from] MultipartError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    EditorOpen(#[from] EditorOpenError),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Too many requests: {0}")]
    TooManyRequests(String),
    #[error("Payload too large")]
    PayloadTooLarge,
    #[error("Bad gateway: {0}")]
    BadGateway(String),
    #[error(transparent)]
    CommandBuilder(#[from] CommandBuildError),
    #[error(transparent)]
    Pty(#[from] PtyError),
}

impl From<&'static str> for ApiError {
    fn from(msg: &'static str) -> Self {
        ApiError::BadRequest(msg.to_string())
    }
}

impl From<WorkspaceManagerError> for ApiError {
    fn from(err: WorkspaceManagerError) -> Self {
        match err {
            WorkspaceManagerError::Database(err) => ApiError::Database(err),
            WorkspaceManagerError::Repo(err) => ApiError::Repo(err),
            WorkspaceManagerError::Worktree(err) => ApiError::Worktree(err),
            WorkspaceManagerError::GitService(err) => ApiError::GitService(err),
            WorkspaceManagerError::Io(err) => ApiError::Io(err),
            WorkspaceManagerError::WorkspaceNotFound => {
                ApiError::Workspace(WorkspaceError::WorkspaceNotFound)
            }
            WorkspaceManagerError::RepoAlreadyAttached => {
                ApiError::Conflict("Repository already attached to workspace".to_string())
            }
            WorkspaceManagerError::BranchNotFound { repo_name, branch } => {
                ApiError::BadRequest(format!(
                    "Branch '{}' does not exist in repository '{}'",
                    branch, repo_name
                ))
            }
            WorkspaceManagerError::NoRepositories => {
                ApiError::BadRequest("Workspace has no repositories configured".to_string())
            }
            WorkspaceManagerError::PartialCreation(msg) => ApiError::Conflict(msg),
        }
    }
}

impl From<WorktreeError> for ApiError {
    fn from(err: WorktreeError) -> Self {
        match err {
            WorktreeError::GitService(e) => ApiError::GitService(e),
            other => ApiError::Worktree(other),
        }
    }
}

impl From<ContainerError> for ApiError {
    fn from(err: ContainerError) -> Self {
        match err {
            ContainerError::GitServiceError(e) => ApiError::GitService(e),
            ContainerError::Workspace(e) => ApiError::Workspace(e),
            ContainerError::Session(e) => ApiError::Session(e),
            ContainerError::ExecutionProcess(e) => ApiError::ExecutionProcess(e),
            ContainerError::ExecutorError(e) => ApiError::Executor(e),
            ContainerError::Worktree(e) => e.into(),
            other => ApiError::Container(other),
        }
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

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let info = match &self {
            ApiError::Repo(RepoError::Database(_)) => ErrorInfo::internal("RepoError"),
            ApiError::Repo(RepoError::NotFound) => {
                ErrorInfo::not_found("RepoError", "Repository not found.")
            }

            ApiError::Workspace(WorkspaceError::Database(_)) => {
                ErrorInfo::internal("WorkspaceError")
            }
            ApiError::Workspace(WorkspaceError::WorkspaceNotFound) => {
                ErrorInfo::not_found("WorkspaceError", "Workspace not found.")
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

            ApiError::GitService(GitServiceError::MergeConflicts { message, .. }) => {
                ErrorInfo::conflict("GitServiceError", message.clone())
            }
            ApiError::GitService(GitServiceError::RebaseInProgress) => ErrorInfo::conflict(
                "GitServiceError",
                "A rebase is already in progress. Resolve conflicts or abort the rebase, then retry.",
            ),
            ApiError::GitService(GitServiceError::BranchNotFound(branch)) => ErrorInfo::not_found(
                "GitServiceError",
                format!(
                    "Branch '{}' not found. Try changing the target branch.",
                    branch
                ),
            ),
            ApiError::GitService(GitServiceError::BranchesDiverged(msg)) => ErrorInfo::conflict(
                "GitServiceError",
                format!(
                    "{} Rebase onto the target branch first, then retry the merge.",
                    msg
                ),
            ),
            ApiError::GitService(GitServiceError::WorktreeDirty(branch, files)) => {
                ErrorInfo::conflict(
                    "GitServiceError",
                    format!(
                        "Branch '{}' has uncommitted changes ({}). Commit or revert them before retrying.",
                        branch, files
                    ),
                )
            }
            ApiError::GitService(GitServiceError::GitCLI(git::GitCliError::AuthFailed(msg))) => {
                ErrorInfo::with_status(
                    StatusCode::UNAUTHORIZED,
                    "GitServiceError",
                    format!(
                        "{}. Check your git credentials or SSH keys and try again.",
                        msg
                    ),
                )
            }
            ApiError::GitService(e) => ErrorInfo::with_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                "GitServiceError",
                format!("Git operation failed: {}", e),
            ),
            ApiError::GitHost(_) => ErrorInfo::internal("GitHostError"),

            ApiError::File(FileError::TooLarge(size, max)) => ErrorInfo::with_status(
                StatusCode::PAYLOAD_TOO_LARGE,
                "FileTooLarge",
                format!(
                    "This file is too large ({:.1} MB). Maximum file size is {:.1} MB.",
                    *size as f64 / 1_048_576.0,
                    *max as f64 / 1_048_576.0
                ),
            ),
            ApiError::File(FileError::NotFound) => {
                ErrorInfo::not_found("FileNotFound", "File not found.")
            }
            ApiError::File(_) => ErrorInfo {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                error_type: "FileError",
                message: Some("Failed to process file. Please try again.".into()),
            },

            ApiError::EditorOpen(EditorOpenError::LaunchFailed { .. }) => {
                ErrorInfo::internal("EditorLaunchError")
            }
            ApiError::EditorOpen(_) => {
                ErrorInfo::bad_request("EditorOpenError", format!("{}", self))
            }

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
            ApiError::TooManyRequests(msg) => ErrorInfo::with_status(
                StatusCode::TOO_MANY_REQUESTS,
                "TooManyRequests",
                msg.clone(),
            ),
            ApiError::PayloadTooLarge => ErrorInfo::with_status(
                StatusCode::PAYLOAD_TOO_LARGE,
                "PayloadTooLarge",
                "Request body too large".to_string(),
            ),
            ApiError::BadGateway(msg) => {
                ErrorInfo::with_status(StatusCode::BAD_GATEWAY, "BadGateway", msg.clone())
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
            ApiError::Worktree(err) => ErrorInfo::with_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                "WorktreeError",
                format!("Worktree operation failed: {}", err),
            ),
            ApiError::Config(_) => ErrorInfo::internal("ConfigError"),
            ApiError::Io(_) => ErrorInfo::internal("IoError"),
        };

        // Log internal errors so they are visible in server output.
        if info.status.is_server_error() {
            tracing::error!(
                error_type = info.error_type,
                status = %info.status,
                error = ?self,
                "API request failed"
            );
        }

        let message = info
            .message
            .unwrap_or_else(|| format!("{}: {}", info.error_type, self));
        let response = ApiResponse::<()>::error(&message);
        (info.status, Json(response)).into_response()
    }
}

impl From<TrustedKeyAuthError> for ApiError {
    fn from(err: TrustedKeyAuthError) -> Self {
        match err {
            TrustedKeyAuthError::Unauthorized => ApiError::Unauthorized,
            TrustedKeyAuthError::BadRequest(msg) => ApiError::BadRequest(msg),
            TrustedKeyAuthError::Forbidden(msg) => ApiError::Forbidden(msg),
            TrustedKeyAuthError::TooManyRequests(msg) => ApiError::TooManyRequests(msg),
            TrustedKeyAuthError::Io(e) => ApiError::Io(e),
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
