use axum::{
    Router, extract::State, http::StatusCode, response::Json as ResponseJson, routing::post,
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::tick::TickTrigger;
use utils::response::ApiResponse;

use crate::DeploymentImpl;

#[derive(Deserialize)]
pub struct TriggerTickRequest {
    #[serde(default = "default_trigger_id")]
    pub trigger_id: String,
}

fn default_trigger_id() -> String {
    "manual".to_string()
}

pub async fn trigger_tick(
    State(deployment): State<DeploymentImpl>,
    ResponseJson(request): ResponseJson<TriggerTickRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, StatusCode> {
    let trigger = TickTrigger {
        trigger_id: request.trigger_id.clone(),
    };

    deployment
        .tick_trigger()
        .send(trigger)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(ResponseJson(ApiResponse::success(format!(
        "Tick triggered: {}",
        request.trigger_id
    ))))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/tick", post(trigger_tick))
}
