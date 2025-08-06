use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use db::models::{project::ProjectError, task_attempt::TaskAttemptError};
use deployment::DeploymentError;
use executors::executors::ExecutorError;
use git2::Error as Git2Error;
use services::services::{
    auth::AuthError, config::ConfigError, container::ContainerError, git::GitServiceError,
    github_service::GitHubServiceError, worktree_manager::WorktreeError,
};
use thiserror::Error;
use utils::response::ApiResponse;

#[derive(Debug, Error, ts_rs::TS)]
#[ts(export)]
#[ts(type = "string")]
pub enum ApiError {
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error(transparent)]
    TaskAttempt(#[from] TaskAttemptError),
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[error(transparent)]
    GitHubService(#[from] GitHubServiceError),
    #[error(transparent)]
    Auth(#[from] AuthError),
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
            ApiError::GitService(_) => (StatusCode::INTERNAL_SERVER_ERROR, "GitServiceError"),
            ApiError::GitHubService(_) => (StatusCode::INTERNAL_SERVER_ERROR, "GitHubServiceError"),
            ApiError::Auth(_) => (StatusCode::INTERNAL_SERVER_ERROR, "AuthError"),
            ApiError::Deployment(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DeploymentError"),
            ApiError::Container(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ContainerError"),
            ApiError::Executor(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ExecutorError"),
            ApiError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DatabaseError"),
            ApiError::Worktree(_) => (StatusCode::INTERNAL_SERVER_ERROR, "WorktreeError"),
            ApiError::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ConfigError"),
        };

        let error_message = format!("{}: {}", error_type, self);
        let response = ApiResponse::<()>::error(&error_message);
        (status_code, Json(response)).into_response()
    }
}
