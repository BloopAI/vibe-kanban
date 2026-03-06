use axum::Router;

use crate::DeploymentImpl;

pub mod client;
pub mod server;

pub use client::{PairRelayHostRequest, PairRelayHostResponse};
pub use server::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse, ListRelayPairedClientsResponse,
    RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse, RelayPairedClient,
    RemoveRelayPairedClientResponse, StartSpake2EnrollmentRequest, StartSpake2EnrollmentResponse,
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(server::router())
        .merge(client::router())
}
