use thiserror::Error;

use crate::services::remote_client::RemoteClientError;

#[derive(Debug, Error)]
pub enum MigrationError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),

    #[error(transparent)]
    MigrationState(#[from] db::models::migration_state::MigrationStateError),

    #[error(transparent)]
    Workspace(#[from] db::models::workspace::WorkspaceError),

    #[error(transparent)]
    RemoteClient(#[from] RemoteClientError),

    #[error("not authenticated - please log in first")]
    NotAuthenticated,

    #[error("organization not found for user")]
    OrganizationNotFound,

    #[error("entity not found: {entity_type} with id {id}")]
    EntityNotFound { entity_type: String, id: String },

    #[error("migration already in progress")]
    MigrationInProgress,

    #[error("status mapping failed: unknown status '{0}'")]
    StatusMappingFailed(String),

    #[error("broken reference chain: {0}")]
    BrokenReferenceChain(String),

    #[error("remote error: {0}")]
    RemoteError(String),
}
