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

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::{RemoteTaskContext, load_task_middleware},
};

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

fn empty_variables_response<T>() -> ResponseJson<ApiResponse<Vec<T>>> {
    ResponseJson(ApiResponse::success(vec![]))
}

fn reject_remote_variable_mutation(remote_ctx: Option<&RemoteTaskContext>) -> Result<(), ApiError> {
    if remote_ctx.is_some() {
        return Err(ApiError::BadRequest(
            "Cannot modify variables for remote tasks".to_string(),
        ));
    }

    Ok(())
}

fn remote_system_variables(
    task: &Task,
    project_title: Option<&str>,
) -> HashMap<String, (String, Option<Uuid>)> {
    [
        ("TASK_ID".to_string(), task.id.to_string()),
        (
            "PARENT_TASK_ID".to_string(),
            task.parent_task_id
                .map(|id| id.to_string())
                .unwrap_or_default(),
        ),
        ("TASK_TITLE".to_string(), task.title.clone()),
        (
            "TASK_DESCRIPTION".to_string(),
            task.description.clone().unwrap_or_default(),
        ),
        ("TASK_LABEL".to_string(), String::new()),
        ("PROJECT_ID".to_string(), task.project_id.to_string()),
        (
            "PROJECT_TITLE".to_string(),
            project_title.unwrap_or_default().to_string(),
        ),
        (
            "IS_SUBTASK".to_string(),
            if task.parent_task_id.is_some() {
                "true"
            } else {
                "false"
            }
            .to_string(),
        ),
    ]
    .into_iter()
    .map(|(name, value)| (name, (value, Some(task.id))))
    .collect()
}

fn build_preview_expansion_response(
    text: &str,
    variables: &HashMap<String, (String, Option<Uuid>)>,
) -> PreviewExpansionResponse {
    let result = variable_expander::expand_variables(text, variables);

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
    }
}

async fn require_task_variable(
    pool: &sqlx::SqlitePool,
    task_id: Uuid,
    var_id: Uuid,
) -> Result<TaskVariable, ApiError> {
    let variable = TaskVariable::find_by_id(pool, var_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    if variable.task_id != task_id {
        return Err(ApiError::Database(sqlx::Error::RowNotFound));
    }

    Ok(variable)
}

/// Get all variables defined directly on a task (not inherited)
pub async fn get_task_variables(
    Extension(task): Extension<Task>,
    remote_ctx: Option<Extension<RemoteTaskContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskVariable>>>, ApiError> {
    // Remote tasks don't have local variables - return empty
    if remote_ctx.is_some() {
        return Ok(empty_variables_response());
    }

    let variables = TaskVariable::find_by_task_id(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(variables)))
}

/// Get all resolved variables for a task including inherited ones from parent chain
pub async fn get_resolved_variables(
    Extension(task): Extension<Task>,
    remote_ctx: Option<Extension<RemoteTaskContext>>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ResolvedVariable>>>, ApiError> {
    // Remote tasks don't have local variables - return empty
    if remote_ctx.is_some() {
        return Ok(empty_variables_response());
    }

    let variables =
        TaskVariable::find_inherited_with_system(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(variables)))
}

/// Create a new variable on a task
pub async fn create_task_variable(
    Extension(task): Extension<Task>,
    remote_ctx: Option<Extension<RemoteTaskContext>>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskVariable>,
) -> Result<ResponseJson<ApiResponse<TaskVariable>>, ApiError> {
    reject_remote_variable_mutation(remote_ctx.as_deref())?;

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

    require_task_variable(&deployment.db().pool, params.task_id, params.var_id).await?;
    let variable = TaskVariable::update(&deployment.db().pool, params.var_id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(variable)))
}

/// Delete a variable
pub async fn delete_task_variable(
    State(deployment): State<DeploymentImpl>,
    Path(params): Path<VariablePathParams>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    require_task_variable(&deployment.db().pool, params.task_id, params.var_id).await?;
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
    remote_ctx: Option<Extension<RemoteTaskContext>>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<PreviewExpansionRequest>,
) -> Result<ResponseJson<ApiResponse<PreviewExpansionResponse>>, ApiError> {
    let variables = if remote_ctx.is_some() {
        let project_title =
            db::models::project::Project::find_by_id(&deployment.db().pool, task.project_id)
                .await?
                .map(|project| project.name);
        remote_system_variables(&task, project_title.as_deref())
    } else {
        TaskVariable::find_inherited_with_system(&deployment.db().pool, task.id)
            .await?
            .into_iter()
            .map(|rv| (rv.name, (rv.value, Some(rv.source_task_id))))
            .collect()
    };

    Ok(ResponseJson(ApiResponse::success(
        build_preview_expansion_response(&payload.text, &variables),
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

#[cfg(test)]
mod tests {
    use super::*;
    use db::{
        models::{
            project::{CreateProject, Project},
            task::{CreateTask, Task},
            task_variable::CreateTaskVariable,
        },
        test_utils::create_test_pool,
    };

    async fn create_task_for_variables_test(
        pool: &sqlx::SqlitePool,
        name: &str,
    ) -> Result<Task, Box<dyn std::error::Error>> {
        let project = Project::create(
            pool,
            &CreateProject {
                name: format!("{name}-project"),
                git_repo_path: format!("/tmp/{name}-project"),
                use_existing_repo: true,
                clone_url: None,
                setup_script: None,
                dev_script: None,
                cleanup_script: None,
                copy_files: None,
            },
            Uuid::new_v4(),
        )
        .await?;

        let task = Task::create(
            pool,
            &CreateTask {
                project_id: project.id,
                title: format!("{name}-task"),
                description: None,
                status: None,
                parent_task_id: None,
                image_ids: None,
                shared_task_id: None,
            },
            Uuid::new_v4(),
        )
        .await?;

        Ok(task)
    }

    #[test]
    fn remote_system_variables_preserve_runtime_task_context() {
        let task = Task {
            id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            title: "Remote title".to_string(),
            description: Some("Remote description".to_string()),
            status: db::models::task::TaskStatus::Todo,
            parent_task_id: Some(Uuid::new_v4()),
            shared_task_id: Some(Uuid::new_v4()),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            remote_assignee_user_id: None,
            remote_assignee_name: None,
            remote_assignee_username: None,
            remote_version: 0,
            remote_last_synced_at: None,
            remote_stream_node_id: None,
            remote_stream_url: None,
            archived_at: None,
            activity_at: None,
        };

        let response = build_preview_expansion_response(
            "Task $TASK_TITLE in $PROJECT_TITLE [$IS_SUBTASK]",
            &remote_system_variables(&task, Some("Remote project")),
        );

        assert_eq!(
            response.expanded_text,
            "Task Remote title in Remote project [true]"
        );
        assert!(response.undefined_variables.is_empty());
        assert_eq!(response.expanded_variables.len(), 3);
    }

    #[test]
    fn reject_remote_variable_mutation_blocks_remote_tasks() {
        let ctx = RemoteTaskContext {
            shared_task_id: Uuid::new_v4(),
            origin_node_id: None,
        };

        let result = reject_remote_variable_mutation(Some(&ctx));
        assert!(matches!(result, Err(ApiError::BadRequest(_))));
    }

    #[tokio::test]
    async fn require_task_variable_rejects_variable_from_different_task() {
        let (pool, _temp_dir) = create_test_pool().await;
        let task_a = create_task_for_variables_test(&pool, "alpha")
            .await
            .expect("create task A");
        let task_b = create_task_for_variables_test(&pool, "beta")
            .await
            .expect("create task B");

        let variable = TaskVariable::create(
            &pool,
            task_b.id,
            &CreateTaskVariable {
                name: "FOO".to_string(),
                value: "bar".to_string(),
            },
        )
        .await
        .expect("create variable");

        let result = require_task_variable(&pool, task_a.id, variable.id).await;
        assert!(matches!(
            result,
            Err(ApiError::Database(sqlx::Error::RowNotFound))
        ));
    }

    #[tokio::test]
    async fn require_task_variable_accepts_variable_for_matching_task() {
        let (pool, _temp_dir) = create_test_pool().await;
        let task = create_task_for_variables_test(&pool, "gamma")
            .await
            .expect("create task");

        let variable = TaskVariable::create(
            &pool,
            task.id,
            &CreateTaskVariable {
                name: "FOO".to_string(),
                value: "bar".to_string(),
            },
        )
        .await
        .expect("create variable");

        let resolved = require_task_variable(&pool, task.id, variable.id)
            .await
            .expect("resolve variable");

        assert_eq!(resolved.id, variable.id);
        assert_eq!(resolved.task_id, task.id);
    }
}
