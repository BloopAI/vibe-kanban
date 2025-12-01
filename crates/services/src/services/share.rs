mod config;
mod publisher;
mod status;

pub use config::ShareConfig;
pub use publisher::{SharePublisher, SharedTaskDetails};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    RemoteClientError,
    services::{git::GitServiceError, github::GitHubServiceError},
};

#[derive(Debug, Error)]
pub enum ShareError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Transport(#[from] reqwest::Error),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
    #[error(transparent)]
    Url(#[from] url::ParseError),
    #[error("share configuration missing: {0}")]
    MissingConfig(&'static str),
    #[error("task {0} not found")]
    TaskNotFound(Uuid),
    #[error("project {0} not found")]
    ProjectNotFound(Uuid),
    #[error("project {0} is not linked to a remote project")]
    ProjectNotLinked(Uuid),
    #[error("invalid response from remote share service")]
    InvalidResponse,
    #[error("task {0} is already shared")]
    AlreadyShared(Uuid),
    #[error("GitHub token is required to fetch repository ID")]
    MissingGitHubToken,
    #[error(transparent)]
    Git(#[from] GitServiceError),
    #[error(transparent)]
    GitHub(#[from] GitHubServiceError),
    #[error("share authentication missing or expired")]
    MissingAuth,
    #[error("invalid user ID format")]
    InvalidUserId,
    #[error("invalid organization ID format")]
    InvalidOrganizationId,
    #[error(transparent)]
    RemoteClientError(#[from] RemoteClientError),
}
