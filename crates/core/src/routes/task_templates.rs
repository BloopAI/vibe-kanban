use axum::{
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
    Extension, Json, Router,
};
use db::models::task_template::{CreateTaskTemplate, TaskTemplate, UpdateTaskTemplate};
use deployment::{Deployment, DeploymentError};
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{middleware::load_task_template_middleware, DeploymentImpl};

pub async fn list_templates(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplate>>>, DeploymentError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::find_all(&deployment.db().pool).await?,
    )))
}

// TODO merge with list_templates
pub async fn list_project_templates(
    State(deployment): State<DeploymentImpl>,
    Path(project_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplate>>>, DeploymentError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::find_by_project_id(&deployment.db().pool, Some(project_id)).await?,
    )))
}

pub async fn list_global_templates(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplate>>>, DeploymentError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::find_by_project_id(&deployment.db().pool, None).await?,
    )))
}

pub async fn get_template(
    Extension(template): Extension<TaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, DeploymentError> {
    Ok(Json(ApiResponse::success(template)))
}

pub async fn create_template(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, DeploymentError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::create(&deployment.db().pool, &payload).await?,
    )))
}

pub async fn update_template(
    Extension(template): Extension<TaskTemplate>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, DeploymentError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::update(&deployment.db().pool, template.id, &payload).await?,
    )))
}

pub async fn delete_template(
    Extension(template): Extension<TaskTemplate>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, DeploymentError> {
    let rows_affected = TaskTemplate::delete(&deployment.db().pool, template.id).await?;
    if rows_affected == 0 {
        Err(DeploymentError::Sqlx(SqlxError::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_template_router = Router::new()
        .route(
            "/",
            get(get_template)
                .put(update_template)
                .delete(delete_template),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_template_middleware,
        ));

    let inner = Router::new()
        .route("/", get(list_templates).post(create_template))
        .nest("/{template_id}", task_template_router)
        .route("/{project_id}/templates", get(list_project_templates))
        .route("/global", get(list_global_templates));

    // mount under /templates
    Router::new().nest("/templates", inner)
}
