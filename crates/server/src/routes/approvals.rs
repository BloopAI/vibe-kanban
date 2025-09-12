use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use deployment::Deployment;
use utils::approvals::{
    ApprovalRequest, ApprovalResponseRequest, ApprovalStatus, CreateApprovalRequest,
};

use crate::DeploymentImpl;

pub async fn create_approval(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateApprovalRequest>,
) -> Result<Json<ApprovalRequest>, StatusCode> {
    let service = deployment.approvals();
    let approval_request = ApprovalRequest::from_create(request);

    match service.create(approval_request).await {
        Ok(approval) => Ok(Json(approval)),
        Err(e) => {
            tracing::error!("Failed to create approval: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_approval_status(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApprovalStatus>, StatusCode> {
    let service = deployment.approvals();
    match service.status(&id).await {
        Some(status) => Ok(Json(status)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn respond_to_approval(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
    Json(request): Json<ApprovalResponseRequest>,
) -> Result<(), StatusCode> {
    let service = deployment.approvals();

    match service.respond(&id, request).await {
        Ok(_) => Ok(()),
        Err(e) => {
            tracing::error!("Failed to respond to approval: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_pending_approvals(
    State(deployment): State<DeploymentImpl>,
) -> Json<Vec<ApprovalRequest>> {
    let service = deployment.approvals();
    let approvals = service.pending().await;
    Json(approvals)
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/approvals/create", post(create_approval))
        .route("/approvals/{id}/status", get(get_approval_status))
        .route("/approvals/{id}/respond", post(respond_to_approval))
        .route("/approvals/pending", get(get_pending_approvals))
}
