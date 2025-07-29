use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use db::models::task_attempt::TaskAttemptError;
use git2::Error as Git2Error;
use services::services::{git::GitServiceError, github_service::GitHubServiceError};
use utils::response::ApiResponse;

#[derive(Debug)]
pub enum RouteError {
    TaskAttempt(TaskAttemptError),
    GitService(GitServiceError),
    GitHubService(GitHubServiceError),
    Database(sqlx::Error),
}

impl std::fmt::Display for RouteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RouteError::TaskAttempt(e) => write!(f, "{}", e),
            RouteError::GitService(e) => write!(f, "{}", e),
            RouteError::GitHubService(e) => write!(f, "{}", e),
            RouteError::Database(e) => write!(f, "{}", e),
        }
    }
}

impl From<TaskAttemptError> for RouteError {
    fn from(err: TaskAttemptError) -> Self {
        RouteError::TaskAttempt(err)
    }
}

impl From<GitServiceError> for RouteError {
    fn from(err: GitServiceError) -> Self {
        RouteError::GitService(err)
    }
}

impl From<GitHubServiceError> for RouteError {
    fn from(err: GitHubServiceError) -> Self {
        RouteError::GitHubService(err)
    }
}

impl From<sqlx::Error> for RouteError {
    fn from(err: sqlx::Error) -> Self {
        RouteError::Database(err)
    }
}

// TODO: Define a WorktreeError type and return from WorktreeManager
impl From<Git2Error> for RouteError {
    fn from(err: Git2Error) -> Self {
        RouteError::GitService(GitServiceError::from(err))
    }
}

impl IntoResponse for RouteError {
    fn into_response(self) -> Response {
        let error_type = match &self {
            RouteError::TaskAttempt(_) => "TaskAttemptError",
            RouteError::GitService(_) => "GitServiceError",
            RouteError::GitHubService(_) => "GitHubServiceError",
            RouteError::Database(_) => "DatabaseError",
        };

        let error_message = format!("{}: {}", error_type, self);
        let response = ApiResponse::<()>::error(&error_message);

        (StatusCode::INTERNAL_SERVER_ERROR, Json(response)).into_response()
    }
}
