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
use deployment::{DeploymentError, RelayHostsNotConfigured, RemoteClientNotConfigured};
use executors::{command::CommandBuildError, executors::ExecutorError};
use git::GitServiceError;
use git_host::GitHostError;
use local_deployment::pty::PtyError;
use relay_hosts::{
    RelayApiError, RelayConnectionError, RelayHostLookupError, RelayPairingClientError,
};
use relay_webrtc::WebRtcError;
use services::services::{
    config::{ConfigError, EditorOpenError},
    container::ContainerError,
    file::FileError,
    local_remote::LocalRemoteError,
    remote_client::RemoteClientError,
    repo::RepoError as RepoServiceError,
};
use thiserror::Error;
use trusted_key_auth::error::TrustedKeyAuthError;
use utils::response::{ApiErrorEnvelope, ApiResponse};
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
    #[error(transparent)]
    WebRtc(#[from] WebRtcError),
}

impl From<&'static str> for ApiError {
    fn from(msg: &'static str) -> Self {
        ApiError::BadRequest(msg.to_string())
    }
}

impl From<RemoteClientNotConfigured> for ApiError {
    fn from(_: RemoteClientNotConfigured) -> Self {
        ApiError::BadRequest("Remote client not configured".to_string())
    }
}

impl From<LocalRemoteError> for ApiError {
    fn from(err: LocalRemoteError) -> Self {
        match err {
            LocalRemoteError::NotFound => ApiError::BadRequest("Not found".to_string()),
            LocalRemoteError::Sqlx(e) => ApiError::Database(e),
            LocalRemoteError::Invalid(msg) => ApiError::BadRequest(msg),
        }
    }
}

impl From<RelayHostsNotConfigured> for ApiError {
    fn from(_: RelayHostsNotConfigured) -> Self {
        ApiError::BadRequest("Remote relay API is not configured".to_string())
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
    envelope: Option<utils::response::ApiErrorEnvelope>,
}

impl ErrorInfo {
    fn internal(error_type: &'static str) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error_type,
            message: Some("An internal error occurred. Please try again.".into()),
            envelope: None,
        }
    }

    fn not_found(error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            error_type,
            message: Some(msg.into()),
            envelope: None,
        }
    }

    fn bad_request(error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            error_type,
            message: Some(msg.into()),
            envelope: None,
        }
    }

    fn conflict(error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            error_type,
            message: Some(msg.into()),
            envelope: None,
        }
    }

    fn with_status(status: StatusCode, error_type: &'static str, msg: impl Into<String>) -> Self {
        Self {
            status,
            error_type,
            message: Some(msg.into()),
            envelope: None,
        }
    }
}

/// Classify an `ExecutorError` into the stable 5-kind envelope surfaced to clients.
/// - `executor_not_found`: missing binary
/// - `auth_required`: user must re-authenticate
/// - `follow_up_not_supported`: chosen executor does not support follow-up
/// - `spawn_failed`: retryable IO / spawn failure
/// - `internal`: fallback for everything else
pub fn executor_error_envelope(
    err: &executors::executors::ExecutorError,
    stderr_tail: Option<String>,
    program: Option<String>,
) -> ApiErrorEnvelope {
    use executors::executors::ExecutorError::*;
    let (kind, retryable, human) = match err {
        ExecutableNotFound { .. } => ("executor_not_found", false, true),
        AuthRequired(_) => ("auth_required", false, true),
        FollowUpNotSupported(_) => ("follow_up_not_supported", false, false),
        SpawnError(_) | Io(_) => ("spawn_failed", true, false),
        SetupHelperNotSupported => ("internal", false, true),
        _ => ("internal", true, false),
    };
    let program = program.or_else(|| match err {
        ExecutableNotFound { program } => Some(program.clone()),
        _ => None,
    });
    ApiErrorEnvelope {
        kind: kind.to_string(),
        retryable,
        human_intervention_required: human,
        stderr_tail,
        program,
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
            envelope: None,
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
                    if matches!(
                        m.as_str(),
                        "invalid_token"
                            | "expired_token"
                            | "session_revoked"
                            | "token_reuse_detected"
                            | "provider_token_revoked"
                            | "identity_error"
                    ) {
                        return ErrorInfo::with_status(
                            StatusCode::UNAUTHORIZED,
                            "RemoteClientError",
                            "Unauthorized. Please sign in again.",
                        );
                    }
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
                envelope: None,
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
            ApiError::Executor(e) => ErrorInfo {
                status: StatusCode::INTERNAL_SERVER_ERROR,
                error_type: "ExecutorError",
                message: Some(e.to_string()),
                envelope: Some(executor_error_envelope(e, None, None)),
            },
            ApiError::CommandBuilder(_) => ErrorInfo::internal("CommandBuildError"),
            ApiError::Database(_) => ErrorInfo::internal("DatabaseError"),
            ApiError::Worktree(err) => ErrorInfo::with_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                "WorktreeError",
                format!("Worktree operation failed: {}", err),
            ),
            ApiError::Config(_) => ErrorInfo::internal("ConfigError"),
            ApiError::Io(_) => ErrorInfo::internal("IoError"),
            ApiError::WebRtc(err) => match err {
                WebRtcError::SessionNotFound { .. } => {
                    ErrorInfo::not_found("WebRtcError", err.to_string())
                }
                WebRtcError::IceGatheringTimedOut
                | WebRtcError::IceGatheringChannelDropped
                | WebRtcError::NoLocalDescription
                | WebRtcError::WebRtc(_) => ErrorInfo::bad_request("WebRtcError", err.to_string()),
                WebRtcError::ConnectUpstreamWs(_)
                | WebRtcError::DataChannelSendQueueClosed
                | WebRtcError::WsBridge(_) => {
                    ErrorInfo::with_status(StatusCode::BAD_GATEWAY, "WebRtcError", err.to_string())
                }
                WebRtcError::SerializeMessage(_) => ErrorInfo::internal("WebRtcError"),
            },
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
        let response = if let Some(envelope) = info.envelope {
            ApiResponse::<()>::error_with_envelope(&message, envelope)
        } else {
            ApiResponse::<()>::error(&message)
        };
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

impl From<RelayHostLookupError> for ApiError {
    fn from(err: RelayHostLookupError) -> Self {
        ApiError::BadRequest(err.to_string())
    }
}

impl From<RelayConnectionError> for ApiError {
    fn from(err: RelayConnectionError) -> Self {
        match err {
            RelayConnectionError::NotConfigured => ApiError::BadRequest(err.to_string()),
            RelayConnectionError::RemoteClient(ref inner) => {
                tracing::warn!(%inner, "Relay connection authentication failed");
                ApiError::Unauthorized
            }
            RelayConnectionError::Relay(err) => err.into(),
        }
    }
}

impl From<RelayApiError> for ApiError {
    fn from(err: RelayApiError) -> Self {
        tracing::warn!(%err, "Relay transport failed");
        ApiError::BadGateway(err.to_string())
    }
}

impl From<RelayPairingClientError> for ApiError {
    fn from(err: RelayPairingClientError) -> Self {
        match err {
            RelayPairingClientError::NotConfigured => ApiError::BadRequest(err.to_string()),
            RelayPairingClientError::RemoteClient(ref inner) => {
                tracing::warn!(%inner, "Relay host pairing authentication failed");
                ApiError::Unauthorized
            }
            RelayPairingClientError::Pairing(ref detail) => {
                tracing::warn!(%detail, "Relay host pairing failed");
                ApiError::BadRequest(err.to_string())
            }
            RelayPairingClientError::StoreSerialization(ref detail) => {
                tracing::error!(%detail, "Failed to serialize relay host credentials");
                ApiError::BadGateway(err.to_string())
            }
            RelayPairingClientError::Store(ref detail) => {
                tracing::error!(%detail, "Failed to persist paired relay host credentials");
                ApiError::BadGateway(err.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use executors::executors::ExecutorError;

    use super::*;

    #[test]
    fn classifies_executable_not_found() {
        let err = ExecutorError::ExecutableNotFound {
            program: "claude".to_string(),
        };
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "executor_not_found");
        assert!(!env.retryable);
        assert!(env.human_intervention_required);
        assert_eq!(env.program.as_deref(), Some("claude"));
    }

    #[test]
    fn classifies_auth_required() {
        let err = ExecutorError::AuthRequired("token expired".into());
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "auth_required");
        assert!(!env.retryable);
        assert!(env.human_intervention_required);
    }

    #[test]
    fn classifies_follow_up_not_supported() {
        let err = ExecutorError::FollowUpNotSupported("gemini".into());
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "follow_up_not_supported");
        assert!(!env.retryable);
        assert!(!env.human_intervention_required);
    }

    #[test]
    fn classifies_spawn_error_as_retryable() {
        let err = ExecutorError::Io(std::io::Error::other("boom"));
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "spawn_failed");
        assert!(env.retryable);
        assert!(!env.human_intervention_required);
    }

    #[test]
    fn unknown_variants_fall_through_to_internal() {
        let err = ExecutorError::UnknownExecutorType("foo".into());
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "internal");
        assert!(env.retryable);
    }

    #[test]
    fn envelope_carries_stderr_tail_and_program() {
        let err = ExecutorError::AuthRequired("expired".into());
        let env = executor_error_envelope(
            &err,
            Some("last stderr line".to_string()),
            Some("claude".to_string()),
        );
        assert_eq!(env.stderr_tail.as_deref(), Some("last stderr line"));
        assert_eq!(env.program.as_deref(), Some("claude"));
    }

    #[test]
    fn classifies_setup_helper_not_supported_as_permanent() {
        let err = ExecutorError::SetupHelperNotSupported;
        let env = executor_error_envelope(&err, None, None);
        assert_eq!(env.kind, "internal");
        assert!(
            !env.retryable,
            "setup helper gap is permanent, not retryable"
        );
        assert!(
            env.human_intervention_required,
            "operator must switch executor — human intervention required"
        );
    }

    use axum::response::IntoResponse;
    use http_body_util::BodyExt;

    #[tokio::test]
    async fn executor_error_response_carries_envelope() {
        let err: ApiError = ExecutorError::AuthRequired("expired".into()).into();
        let response = err.into_response();
        let (parts, body) = response.into_parts();
        let bytes = body.collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parts.status, axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(json["success"], false);
        assert_eq!(json["error"]["kind"], "auth_required");
        assert_eq!(json["error"]["retryable"], false);
        assert_eq!(json["error"]["human_intervention_required"], true);
    }

    #[tokio::test]
    async fn non_executor_error_has_no_envelope() {
        let err: ApiError = ApiError::BadRequest("bad".into());
        let response = err.into_response();
        let (_, body) = response.into_parts();
        let bytes = body.collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        // envelope optional; BadRequest does not populate it
        assert!(json.get("error").map_or(true, |v| v.is_null()));
    }
}
