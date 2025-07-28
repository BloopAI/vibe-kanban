use axum::{
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
    Extension, Json, Router,
};
use db::models::task_template::{CreateTaskTemplate, TaskTemplate, UpdateTaskTemplate};
use deployment::{Deployment, DeploymentError};
use serde::Deserialize;
use sqlx::Error as SqlxError;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{middleware::load_task_template_middleware, DeploymentImpl};

#[derive(Debug, Deserialize)]
pub struct TaskTemplateQuery {
    project_id: Option<Uuid>,
}

pub async fn get_templates(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<Option<TaskTemplateQuery>>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplate>>>, DeploymentError> {
    let templates = match query {
        Some(query) => {
            // If project_id is provided, return only templates for that project
            // If project_id is None, return global templates
            TaskTemplate::find_by_project_id(&deployment.db().pool, query.project_id).await?
        }
        None => {
            // If no query, return all templates
            TaskTemplate::find_all(&deployment.db().pool).await?
        }
    };
    Ok(ResponseJson(ApiResponse::success(templates)))
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
        .route("/", get(get_templates).post(create_template))
        .nest("/{template_id}", task_template_router);

    Router::new().nest("/templates", inner)
}
