use axum::{
    Extension, Json, Router, extract::State, middleware::from_fn_with_state,
    response::Json as ResponseJson, routing::get,
};
use db::models::{
    label::{CreateLabel, Label, UpdateLabel},
    project::Project,
};
use deployment::Deployment;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_label_middleware};

pub async fn get_labels(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Label>>>, ApiError> {
    let labels = Label::find_by_project_id(&deployment.db().pool, project.id).await?;
    Ok(ResponseJson(ApiResponse::success(labels)))
}

pub async fn create_label(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(mut payload): Json<CreateLabel>,
) -> Result<ResponseJson<ApiResponse<Label>>, ApiError> {
    // Override project_id from path
    payload.project_id = project.id;

    let label = Label::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "label_created",
            serde_json::json!({
                "label_id": label.id.to_string(),
                "project_id": project.id.to_string(),
                "name": label.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(label)))
}

pub async fn get_label(
    Extension(label): Extension<Label>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Label>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(label)))
}

pub async fn update_label(
    Extension(label): Extension<Label>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateLabel>,
) -> Result<ResponseJson<ApiResponse<Label>>, ApiError> {
    let updated_label = Label::update(&deployment.db().pool, label.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "label_updated",
            serde_json::json!({
                "label_id": label.id.to_string(),
                "name": updated_label.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_label)))
}

pub async fn delete_label(
    Extension(label): Extension<Label>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Label::delete(&deployment.db().pool, label.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let label_router = Router::new()
        .route("/", get(get_label).put(update_label).delete(delete_label))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_label_middleware,
        ));

    Router::new()
        .route("/", get(get_labels).post(create_label))
        .nest("/{label_id}", label_router)
}
