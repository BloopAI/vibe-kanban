use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::task::Task;
use db::models::task_variable::{
    CreateTaskVariable, ResolvedVariable, TaskVariable, UpdateTaskVariable,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::variable_expander;
use std::collections::HashMap;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_middleware};

/// Validates that a variable name matches the pattern [A-Z][A-Z0-9_]*
fn validate_var_name(name: &str) -> Result<(), ApiError> {
    if name.is_empty() {
        return Err(ApiError::BadRequest(
            "Variable name cannot be empty".to_string(),
        ));
    }

    let mut chars = name.chars();

    // First character must be uppercase letter
    match chars.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => {
            return Err(ApiError::BadRequest(format!(
                "Invalid variable name '{}'. Names must start with an uppercase letter (A-Z).",
                name
            )));
        }
    }

    // Remaining characters must be uppercase letters, digits, or underscores
    for c in chars {
        if !c.is_ascii_uppercase() && !c.is_ascii_digit() && c != '_' {
            return Err(ApiError::BadRequest(format!(
                "Invalid variable name '{}'. Names must contain only uppercase letters, digits, and underscores.",
                name
            )));
        }
    }

    Ok(())
}

/// Get all variables defined directly on a task (not inherited)
pub async fn get_task_variables(
    Extension(task): Extension<Task>,
    remote_ctx: Option<Extension<crate::middleware::RemoteTaskContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskVariable>>>, ApiError> {
    // Remote tasks don't have local variables - return empty
    if remote_ctx.is_some() {
        return Ok(ResponseJson(ApiResponse::success(vec![])));
    }

    let variables = TaskVariable::find_by_task_id(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(variables)))
}

/// Get all resolved variables for a task including inherited ones from parent chain
pub async fn get_resolved_variables(
    Extension(task): Extension<Task>,
    remote_ctx: Option<Extension<crate::middleware::RemoteTaskContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ResolvedVariable>>>, ApiError> {
    // Remote tasks don't have local variables - return empty
    if remote_ctx.is_some() {
        return Ok(ResponseJson(ApiResponse::success(vec![])));
    }

    let variables =
        TaskVariable::find_inherited_with_system(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(variables)))
}

/// Create a new variable on a task
pub async fn create_task_variable(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskVariable>,
) -> Result<ResponseJson<ApiResponse<TaskVariable>>, ApiError> {
    // Validate variable name format
    validate_var_name(&payload.name)?;

    let variable = TaskVariable::create(&deployment.db().pool, task.id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(variable)))
}

/// Path parameters for variable-specific routes
#[derive(Debug, Deserialize)]
pub struct VariablePathParams {
    #[allow(dead_code)]
    task_id: Uuid,
    var_id: Uuid,
}

/// Update an existing variable
pub async fn update_task_variable(
    State(deployment): State<DeploymentImpl>,
    Path(params): Path<VariablePathParams>,
    Json(payload): Json<UpdateTaskVariable>,
) -> Result<ResponseJson<ApiResponse<TaskVariable>>, ApiError> {
    // Validate variable name format if being updated
    if let Some(ref name) = payload.name {
        validate_var_name(name)?;
    }

    let variable = TaskVariable::update(&deployment.db().pool, params.var_id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(variable)))
}

/// Delete a variable
pub async fn delete_task_variable(
    State(deployment): State<DeploymentImpl>,
    Path(params): Path<VariablePathParams>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskVariable::delete(&deployment.db().pool, params.var_id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

/// Request for previewing variable expansion
#[derive(Debug, Deserialize, TS)]
pub struct PreviewExpansionRequest {
    /// The text to expand variables in
    pub text: String,
}

/// Response from previewing variable expansion
#[derive(Debug, Serialize, TS)]
pub struct PreviewExpansionResponse {
    /// The text with variables expanded
    pub expanded_text: String,
    /// Variables that were referenced but not defined
    pub undefined_variables: Vec<String>,
    /// Variables that were successfully expanded
    pub expanded_variables: Vec<ExpandedVariableInfo>,
}

/// Information about an expanded variable
#[derive(Debug, Serialize, TS)]
pub struct ExpandedVariableInfo {
    /// The variable name
    pub name: String,
    /// The task ID where this variable was defined
    pub source_task_id: Option<String>,
}

/// Preview variable expansion on arbitrary text using the task's resolved variables
pub async fn preview_expansion(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<PreviewExpansionRequest>,
) -> Result<ResponseJson<ApiResponse<PreviewExpansionResponse>>, ApiError> {
    // Get all resolved variables for the task
    let resolved = TaskVariable::find_inherited_with_system(&deployment.db().pool, task.id).await?;

    // Convert to the format expected by variable_expander
    let variables: HashMap<String, (String, Option<Uuid>)> = resolved
        .into_iter()
        .map(|rv| (rv.name, (rv.value, Some(rv.source_task_id))))
        .collect();

    // Expand variables in the text
    let result = variable_expander::expand_variables(&payload.text, &variables);

    Ok(ResponseJson(ApiResponse::success(
        PreviewExpansionResponse {
            expanded_text: result.text,
            undefined_variables: result.undefined_vars,
            expanded_variables: result
                .expanded_vars
                .into_iter()
                .map(|(name, source_id)| ExpandedVariableInfo {
                    name,
                    source_task_id: source_id.map(|id| id.to_string()),
                })
                .collect(),
        },
    )))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Routes under /tasks/:task_id/variables (needs task middleware)
    let task_var_router = Router::new()
        .route("/", get(get_task_variables).post(create_task_variable))
        .route("/resolved", get(get_resolved_variables))
        .route("/preview", post(preview_expansion))
        .layer(from_fn_with_state(deployment.clone(), load_task_middleware));

    // Routes for specific variable operations (don't use task middleware,
    // path params include both task_id and var_id)
    let var_specific_router = Router::new().route(
        "/tasks/{task_id}/variables/{var_id}",
        axum::routing::put(update_task_variable).delete(delete_task_variable),
    );

    Router::new()
        .nest("/tasks/{task_id}/variables", task_var_router)
        .merge(var_specific_router)
}
