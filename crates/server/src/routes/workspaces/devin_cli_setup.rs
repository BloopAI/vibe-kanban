use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    session::{CreateSession, Session},
    workspace::{Workspace, WorkspaceError},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    command::{CommandBuilder, apply_overrides},
    executors::{ExecutorError, devin_cli::DevinCli},
};
use services::services::container::ContainerService;
use uuid::Uuid;

use crate::error::ApiError;

pub async fn run_devin_cli_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
    devin_cli: &DevinCli,
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
        get_setup_helper_action(devin_cli)
            .await?
            .append_action(latest_action.to_owned())
    } else {
        get_setup_helper_action(devin_cli).await?
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
                        executor: Some("devin_cli".to_string()),
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

async fn get_setup_helper_action(devin_cli: &DevinCli) -> Result<ExecutorAction, ApiError> {
    let mut login_command = CommandBuilder::new(DevinCli::base_command());
    login_command = login_command.extend_params(["auth", "login", "--force-manual-token-flow"]);
    login_command = apply_overrides(login_command, &devin_cli.cmd)?;

    let (program_path, args) = login_command
        .build_initial()
        .map_err(|err| ApiError::Executor(ExecutorError::from(err)))?
        .into_resolved()
        .await
        .map_err(ApiError::Executor)?;
    let login_script = format!("{} {}", program_path.to_string_lossy(), args.join(" "));
    let login_request = ScriptRequest {
        script: login_script,
        language: ScriptRequestLanguage::Bash,
        context: ScriptContext::ToolInstallScript,
        working_dir: None,
    };

    Ok(ExecutorAction::new(
        ExecutorActionType::ScriptRequest(login_request),
        None,
    ))
}
