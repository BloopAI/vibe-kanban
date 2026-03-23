use axum::Router;

use crate::{DeploymentImpl, middleware};

mod open_remote_editor;
mod proxy;

pub use open_remote_editor::OpenRemoteWorkspaceInEditorRequest;

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new().merge(proxy::router()).merge(
        open_remote_editor::router()
            .layer(axum::middleware::from_fn_with_state(
                deployment.clone(),
                middleware::sign_relay_response,
            ))
            .layer(axum::middleware::from_fn_with_state(
                deployment.clone(),
                middleware::require_relay_request_signature,
            )),
    )
}
