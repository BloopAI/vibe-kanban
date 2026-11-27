use axum::Router;

use crate::DeploymentImpl;

mod open_remote_editor;
mod proxy;

pub use open_remote_editor::OpenRemoteWorkspaceInEditorRequest;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(proxy::router())
        .merge(open_remote_editor::router())
}
