use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    session::{CreateSession, Session},
    workspace::{Workspace, WorkspaceError},
};
use deployment::Deployment;
use executors::actions::ExecutorAction;
use services::services::container::ContainerService;
use uuid::Uuid;

use crate::error::ApiError;

/// Runs an agent's setup action (install, login) as a setup script, then the workspace's latest
/// coding-agent action again, so the prompt that failed for lack of setup runs after it.
/// `executor` names the session's executor if a new session has to be created.
pub async fn start_agent_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
    setup_action: ExecutorAction,
    executor: &str,
) -> Result<ExecutionProcess, ApiError> {
    let latest_process = ExecutionProcess::find_latest_by_workspace_and_run_reason(
        &deployment.db().pool,
        workspace.id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?;

    let executor_action = if let Some(latest_process) = latest_process {
        let latest_action = latest_process
            .executor_action()
            .map_err(|e| ApiError::Workspace(WorkspaceError::ValidationError(e.to_string())))?;
        setup_action.append_action(latest_action.to_owned())
    } else {
        setup_action
    };

    deployment
        .container()
        .ensure_container_exists(workspace)
        .await?;

    let session =
        match Session::find_latest_by_workspace_id(&deployment.db().pool, workspace.id).await? {
            Some(s) => s,
            None => {
                Session::create(
                    &deployment.db().pool,
                    &CreateSession {
                        executor: Some(executor.to_string()),
                        name: None,
                    },
                    Uuid::new_v4(),
                    workspace.id,
                )
                .await?
            }
        };

    let execution_process = deployment
        .container()
        .start_execution(
            workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::SetupScript,
        )
        .await?;
    Ok(execution_process)
}
