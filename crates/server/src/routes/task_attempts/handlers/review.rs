//! Native review execution handlers.

use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    task::Task,
    task_attempt::TaskAttempt,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_review::{CodingAgentReviewRequest, CodingAgentReviewTarget},
    },
    profile::{ExecutorConfigs, ExecutorProfileId},
};
use services::services::container::ContainerService;
use utils::response::ApiResponse;

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::RemoteTaskAttemptContext,
    proxy::check_remote_task_attempt_proxy,
    routes::task_attempts::{types::CreateReviewAttempt, util::ensure_worktree_path},
};

pub async fn review_attempt(
    Extension(task_attempt): Extension<TaskAttempt>,
    remote_ctx: Option<Extension<RemoteTaskAttemptContext>>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateReviewAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    if let Some(proxy_info) = check_remote_task_attempt_proxy(remote_ctx.as_ref().map(|e| &e.0))? {
        let path = format!("/task-attempts/by-task-id/{}/review", proxy_info.target_id);
        let response: ApiResponse<ExecutionProcess> = deployment
            .node_proxy_client()
            .proxy_post(&proxy_info.node_url, &path, &payload, proxy_info.node_id)
            .await?;
        return Ok(ResponseJson(response));
    }

    let _ = ensure_worktree_path(&deployment, &task_attempt).await?;

    let initial_executor_profile_id = ExecutionProcess::latest_executor_profile_for_attempt(
        &deployment.db().pool,
        task_attempt.id,
    )
    .await?;
    let executor_profile_id = ExecutorProfileId {
        executor: initial_executor_profile_id.executor,
        variant: payload.variant,
    };

    let task = task_attempt
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;

    if Task::unarchive_if_archived(&deployment.db().pool, task.id).await? {
        tracing::info!(task_id = %task.id, "Auto-unarchived task due to review execution");
    }

    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    let cleanup_action = deployment
        .container()
        .cleanup_action(project.cleanup_script);

    let executor_configs = ExecutorConfigs::get_cached();
    let coding_agent = executor_configs.get_coding_agent_or_default(&executor_profile_id);
    let skip_context = coding_agent.no_context();
    let model_changed = {
        let previous_agent =
            executor_configs.get_coding_agent_or_default(&initial_executor_profile_id);
        previous_agent.model() != coding_agent.model()
    };

    let session_id = if skip_context || model_changed {
        None
    } else {
        ExecutionProcess::find_latest_session_id_by_task_attempt(
            &deployment.db().pool,
            task_attempt.id,
        )
        .await?
    };

    let target = payload
        .target
        .unwrap_or_else(|| CodingAgentReviewTarget::BaseBranch {
            branch: task_attempt.target_branch.clone(),
        });

    let action = ExecutorAction::new(
        ExecutorActionType::CodingAgentReviewRequest(CodingAgentReviewRequest {
            target,
            append_to_original_thread: true,
            session_id,
            executor_profile_id,
        }),
        cleanup_action,
    );

    let execution_process = deployment
        .container()
        .start_execution(
            &task_attempt,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}
