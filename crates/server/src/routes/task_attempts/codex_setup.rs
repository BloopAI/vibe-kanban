use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    task_attempt::{TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    command::{CommandBuilder, apply_overrides},
    executors::{ExecutorError, codex::Codex},
};
use services::services::container::ContainerService;

use crate::{error::ApiError, routes::task_attempts::ensure_worktree_path};

pub async fn run_codex_setup(
    deployment: &crate::DeploymentImpl,
    task_attempt: &TaskAttempt,
    codex: &Codex,
) -> Result<ExecutionProcess, ApiError> {
    let latest_process = ExecutionProcess::find_latest_by_task_attempt_and_run_reason(
        &deployment.db().pool,
        task_attempt.id,
        &ExecutionProcessRunReason::CodingAgent,
    )
    .await?;

    let executor_action = if let Some(latest_process) = latest_process {
        let latest_action = latest_process
            .executor_action()
            .map_err(|e| ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string())))?;
        get_setup_helper_action(codex)
            .await?
            .append_action(latest_action.to_owned())
    } else {
        get_setup_helper_action(codex).await?
    };

    let _ = ensure_worktree_path(deployment, task_attempt).await?;

    let execution_process = deployment
        .container()
        .start_execution(
            task_attempt,
            &executor_action,
            &ExecutionProcessRunReason::SetupScript,
        )
        .await?;
    Ok(execution_process)
}

async fn get_setup_helper_action(codex: &Codex) -> Result<ExecutorAction, ApiError> {
    let mut login_command = CommandBuilder::new(Codex::base_command());
    login_command = login_command.extend_params(["login"]);
    login_command = apply_overrides(login_command, &codex.cmd);

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
    };

    Ok(ExecutorAction::new(
        ExecutorActionType::ScriptRequest(login_request),
        None,
    ))
}
