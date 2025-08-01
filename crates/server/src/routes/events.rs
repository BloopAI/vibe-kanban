use axum::{
    extract::{Path, State},
    response::{
        sse::{Event, KeepAlive},
        Sse,
    },
    routing::get,
    BoxError, Router,
};
use deployment::Deployment;
use futures_util::TryStreamExt;
use services::services::container::ContainerService;
use uuid::Uuid;

use crate::DeploymentImpl;

pub async fn events(
    State(deployment): State<DeploymentImpl>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, axum::http::StatusCode>
{
    // Ask the container service for a combined "history + live" stream
    let stream = deployment.stream_events().await;
    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let events_router = Router::new().route("/", get(events));

    Router::new().nest("/events", events_router)
}
