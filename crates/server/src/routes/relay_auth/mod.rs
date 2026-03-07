use axum::Router;

use crate::DeploymentImpl;

pub mod client;
pub mod server;
mod types;

pub use client::{
    ListRelayPairedHostsResponse, PairRelayHostRequest, PairRelayHostResponse, RelayPairedHost,
    RemoveRelayPairedHostResponse,
};
pub use server::{
    ListRelayPairedClientsResponse, RelayPairedClient, RemoveRelayPairedClientResponse,
};
pub use types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse,
    RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse,
    StartSpake2EnrollmentRequest, StartSpake2EnrollmentResponse,
};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .merge(server::router())
        .merge(client::router())
}
