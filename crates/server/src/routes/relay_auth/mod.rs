use axum::Router;

use crate::DeploymentImpl;

pub mod client;
pub mod server;
mod types;

pub use client::{PairRelayHostRequest, PairRelayHostResponse};
pub use server::{
    ListRelayPairedClientsResponse, RefreshRelaySigningSessionRequest,
    RefreshRelaySigningSessionResponse, RelayPairedClient, RemoveRelayPairedClientResponse,
};
pub use types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse, StartSpake2EnrollmentRequest,
    StartSpake2EnrollmentResponse,
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(server::router())
        .merge(client::router())
}
