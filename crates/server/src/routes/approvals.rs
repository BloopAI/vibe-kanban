use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::post,
};
use deployment::Deployment;
use utils::{approvals::{ApprovalResponse, ApprovalStatus}, response::ApiResponse};

use crate::{DeploymentImpl, error::ApiError};

pub async fn respond_to_approval(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
    Json(request): Json<ApprovalResponse>,
) -> Result<ResponseJson<ApiResponse<ApprovalStatus>>, ApiError> {
    let service = deployment.approvals();

    let (status, context) = service.respond(&deployment.db().pool, &id, request).await?;

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

    Ok(ResponseJson(ApiResponse::success(status)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/approvals/{id}/respond", post(respond_to_approval))
}
