use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use deployment::Deployment;
use utils::user_questions::{QuestionResponse, QuestionResponseStatus};

use crate::DeploymentImpl;

pub async fn respond_to_question(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
    Json(request): Json<QuestionResponse>,
) -> Result<Json<QuestionResponseStatus>, StatusCode> {
    let service = deployment.user_questions();

    match service.respond(&deployment.db().pool, &id, request).await {
        Ok((status, context)) => {
            deployment
                .track_if_analytics_allowed(
                    "question_responded",
                    serde_json::json!({
                        "question_id": &id,
                        "status": format!("{:?}", status),
                        "execution_process_id": context.execution_process_id.to_string(),
                    }),
                )
                .await;

            Ok(Json(status))
        }
        Err(e) => {
            tracing::error!("Failed to respond to question: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/questions/{id}/respond", post(respond_to_question))
}
