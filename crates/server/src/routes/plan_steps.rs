use axum::{
    Json, Router,
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{delete, get, patch, post},
};
use db::models::{
    plan_step::{CreatePlanStep, PlanStep, PlanStepStatus, UpdatePlanStep},
    task::{CreateTask, Task},
    task_attempt::TaskAttempt,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

// ============================================================================
// Request/Response Types
// ============================================================================

/// Request body for creating plan steps (bulk create)
/// Note: parent_attempt_id comes from the path parameter
#[derive(Debug, Deserialize, TS)]
pub struct CreatePlanStepRequest {
    pub title: String,
    pub description: Option<String>,
    pub sequence_order: i32,
    #[serde(default)]
    pub auto_start: Option<bool>,
}

/// Request body for updating a plan step
#[derive(Debug, Deserialize, TS)]
pub struct UpdatePlanStepRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<PlanStepStatus>,
    pub sequence_order: Option<i32>,
    pub auto_start: Option<bool>,
}

/// Request body for reordering plan steps
#[derive(Debug, Deserialize, TS)]
pub struct ReorderPlanStepRequest {
    pub id: Uuid,
    pub sequence_order: i32,
}

/// Response for creating subtasks from plan steps
#[derive(Debug, Serialize, TS)]
pub struct CreateSubtasksResponse {
    pub tasks: Vec<Task>,
    pub updated_steps: Vec<PlanStep>,
}

// ============================================================================
// Route Handlers
// ============================================================================

/// GET /api/task-attempts/{attempt_id}/plan-steps
/// Returns all plan steps for an attempt, ordered by sequence_order
pub async fn list_plan_steps(
    Path(attempt_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<PlanStep>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify the attempt exists
    TaskAttempt::find_by_id(pool, attempt_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    let steps = PlanStep::find_by_attempt_id(pool, attempt_id).await?;

    Ok(ResponseJson(ApiResponse::success(steps)))
}

/// POST /api/task-attempts/{attempt_id}/plan-steps
/// Bulk create plan steps (from parsed plan)
pub async fn create_plan_steps(
    Path(attempt_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<Vec<CreatePlanStepRequest>>,
) -> Result<ResponseJson<ApiResponse<Vec<PlanStep>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify the attempt exists
    TaskAttempt::find_by_id(pool, attempt_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    // Validate payload is not empty
    if payload.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one plan step is required".to_string(),
        ));
    }

    // Create each plan step
    let mut created_steps = Vec::with_capacity(payload.len());
    for step_request in payload {
        let create_data = CreatePlanStep {
            parent_attempt_id: attempt_id,
            sequence_order: step_request.sequence_order,
            title: step_request.title,
            description: step_request.description,
            status: Some(PlanStepStatus::Pending),
            child_task_id: None,
            auto_start: step_request.auto_start,
        };

        let step = PlanStep::create(pool, &create_data).await?;
        created_steps.push(step);
    }

    tracing::info!(
        attempt_id = %attempt_id,
        count = created_steps.len(),
        "Created plan steps for attempt"
    );

    Ok(ResponseJson(ApiResponse::success(created_steps)))
}

/// PATCH /api/plan-steps/{step_id}
/// Update a single plan step (title, description, status, sequence_order)
pub async fn update_plan_step(
    Path(step_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdatePlanStepRequest>,
) -> Result<ResponseJson<ApiResponse<PlanStep>>, ApiError> {
    let pool = &deployment.db().pool;

    let update_data = UpdatePlanStep {
        sequence_order: payload.sequence_order,
        title: payload.title,
        description: payload.description,
        status: payload.status,
        child_task_id: None, // Cannot update child_task_id directly via this endpoint
        auto_start: payload.auto_start,
    };

    let updated_step = PlanStep::update(pool, step_id, &update_data)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    tracing::debug!(step_id = %step_id, "Updated plan step");

    Ok(ResponseJson(ApiResponse::success(updated_step)))
}

/// DELETE /api/plan-steps/{step_id}
/// Delete a plan step
pub async fn delete_plan_step(
    Path(step_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let rows_affected = PlanStep::delete(pool, step_id).await?;

    if rows_affected == 0 {
        return Err(ApiError::Database(SqlxError::RowNotFound));
    }

    tracing::info!(step_id = %step_id, "Deleted plan step");

    Ok(ResponseJson(ApiResponse::success(())))
}

/// POST /api/task-attempts/{attempt_id}/plan-steps/reorder
/// Reorder steps (receives array of {id, sequence_order})
pub async fn reorder_plan_steps(
    Path(attempt_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<Vec<ReorderPlanStepRequest>>,
) -> Result<ResponseJson<ApiResponse<Vec<PlanStep>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify the attempt exists
    TaskAttempt::find_by_id(pool, attempt_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    // Validate payload is not empty
    if payload.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one step is required for reordering".to_string(),
        ));
    }

    // Sort by the new sequence_order to get the ordered list of IDs
    let mut sorted_payload = payload;
    sorted_payload.sort_by_key(|r| r.sequence_order);

    let step_ids: Vec<Uuid> = sorted_payload.iter().map(|r| r.id).collect();

    // Reorder the steps
    PlanStep::reorder(pool, attempt_id, &step_ids).await?;

    // Fetch the updated steps
    let updated_steps = PlanStep::find_by_attempt_id(pool, attempt_id).await?;

    tracing::info!(
        attempt_id = %attempt_id,
        count = updated_steps.len(),
        "Reordered plan steps"
    );

    Ok(ResponseJson(ApiResponse::success(updated_steps)))
}

/// POST /api/task-attempts/{attempt_id}/plan-steps/create-subtasks
/// Create child tasks from plan steps and link them
pub async fn create_subtasks_from_steps(
    Path(attempt_id): Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<CreateSubtasksResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify the attempt exists and get it
    let task_attempt = TaskAttempt::find_by_id(pool, attempt_id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    // Get the parent task to find the project_id
    let parent_task = task_attempt
        .parent_task(pool)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    // Get all plan steps for this attempt that don't already have child tasks
    let steps = PlanStep::find_by_attempt_id(pool, attempt_id).await?;
    let steps_without_tasks: Vec<_> = steps
        .into_iter()
        .filter(|s| s.child_task_id.is_none())
        .collect();

    if steps_without_tasks.is_empty() {
        return Ok(ResponseJson(ApiResponse::success(CreateSubtasksResponse {
            tasks: vec![],
            updated_steps: vec![],
        })));
    }

    let mut created_tasks = Vec::with_capacity(steps_without_tasks.len());
    let mut updated_steps = Vec::with_capacity(steps_without_tasks.len());

    for step in steps_without_tasks {
        // Create the child task
        let task_id = Uuid::new_v4();
        let create_task = CreateTask {
            project_id: parent_task.project_id,
            title: step.title.clone(),
            description: step.description.clone(),
            status: None, // Default to Todo
            parent_task_attempt: Some(attempt_id),
            image_ids: None,
            shared_task_id: None,
        };

        let task = Task::create(pool, &create_task, task_id).await?;
        created_tasks.push(task);

        // Link the step to the created task
        PlanStep::set_child_task_id(pool, step.id, Some(task_id)).await?;

        // Fetch the updated step
        if let Some(updated_step) = PlanStep::find_by_id(pool, step.id).await? {
            updated_steps.push(updated_step);
        }
    }

    tracing::info!(
        attempt_id = %attempt_id,
        tasks_created = created_tasks.len(),
        "Created subtasks from plan steps"
    );

    Ok(ResponseJson(ApiResponse::success(CreateSubtasksResponse {
        tasks: created_tasks,
        updated_steps,
    })))
}

// ============================================================================
// Router Setup
// ============================================================================

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Routes nested under /task-attempts/{attempt_id}/plan-steps
    let attempt_routes = Router::new()
        .route("/", get(list_plan_steps).post(create_plan_steps))
        .route("/reorder", post(reorder_plan_steps))
        .route("/create-subtasks", post(create_subtasks_from_steps));

    // Routes for individual plan steps: /plan-steps/{step_id}
    let step_routes = Router::new()
        .route("/", patch(update_plan_step))
        .route("/", delete(delete_plan_step));

    Router::new()
        .nest("/task-attempts/{attempt_id}/plan-steps", attempt_routes)
        .nest("/plan-steps/{step_id}", step_routes)
}
