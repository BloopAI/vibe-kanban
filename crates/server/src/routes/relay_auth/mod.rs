use axum::Router;

use crate::DeploymentImpl;

pub mod client;
pub mod server;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(server::router())
        .merge(client::router())
}
