use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
};
use db::models::task_template::{CreateTaskTemplate, TaskTemplate, UpdateTaskTemplate};
use deployment::Deployment;
use serde::Deserialize;
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_template_middleware};

#[derive(Debug, Deserialize)]
pub struct TaskTemplateQuery {
    global: Option<bool>,
    project_id: Option<Uuid>,
}

pub async fn get_templates(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskTemplateQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplate>>>, ApiError> {
    let templates = match (query.global, query.project_id) {
        // All templates: Global and project-specific
        (None, None) => TaskTemplate::find_all(&deployment.db().pool).await?,
        // Only global templates
        (Some(true), None) => TaskTemplate::find_by_project_id(&deployment.db().pool, None).await?,
        // Only project-specific templates
        (None | Some(false), Some(project_id)) => {
            TaskTemplate::find_by_project_id(&deployment.db().pool, Some(project_id)).await?
        }
        // No global templates, but project_id is None, return empty list
        (Some(false), None) => vec![],
        // Invalid combination: Cannot query both global and project-specific templates
        (Some(_), Some(_)) => {
            return Err(ApiError::Database(SqlxError::InvalidArgument(
                "Cannot query both global and project-specific templates".to_string(),
            )));
        }
    };
    Ok(ResponseJson(ApiResponse::success(templates)))
}

pub async fn get_template(
    Extension(template): Extension<TaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, ApiError> {
    Ok(Json(ApiResponse::success(template)))
}

pub async fn create_template(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::create(&deployment.db().pool, &payload).await?,
    )))
}

pub async fn update_template(
    Extension(template): Extension<TaskTemplate>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(
        TaskTemplate::update(&deployment.db().pool, template.id, &payload).await?,
    )))
}

pub async fn delete_template(
    Extension(template): Extension<TaskTemplate>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskTemplate::delete(&deployment.db().pool, template.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(SqlxError::RowNotFound))
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
        .route("/", get(get_templates).post(create_template))
        .nest("/{template_id}", task_template_router);

    Router::new().nest("/templates", inner)
}
