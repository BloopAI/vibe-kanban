use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use deployment::Deployment;
use utils::approvals::{ApprovalResponse, ApprovalStatus};

use crate::DeploymentImpl;

pub async fn respond_to_approval(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
    Json(request): Json<ApprovalResponse>,
) -> Result<Json<ApprovalStatus>, StatusCode> {
    let service = deployment.approvals();

    match service.respond(&deployment.db().pool, &id, request).await {
        Ok((status, context)) => {
            deployment
                .track_if_analytics_allowed(
                    "approval_responded",
                    serde_json::json!({
                        "approval_id": &id,
                        "status": format!("{:?}", status),
                        "tool_name": context.tool_name,
                        "execution_process_id": context.execution_process_id.to_string(),
                    }),
                )
                .await;

            Ok(Json(status))
        }
        Err(e) => {
            tracing::error!("Failed to respond to approval: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/approvals/{id}/respond", post(respond_to_approval))
}
