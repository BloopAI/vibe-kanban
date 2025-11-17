use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    task_attempt::{TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use executors::actions::ExecutorAction;
#[cfg(unix)]
use executors::{
    actions::{
        ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::cursor::CursorAgent,
};
use services::services::container::ContainerService;
use shlex::try_quote;
use utils::shell::UnixShell;

use crate::{error::ApiError, routes::task_attempts::ensure_worktree_path};

pub async fn run_cursor_setup(
    deployment: &crate::DeploymentImpl,
    task_attempt: &TaskAttempt,
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
        get_setup_helper_action()
            .await?
            .append_action(latest_action.to_owned())
    } else {
        get_setup_helper_action().await?
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

async fn get_setup_helper_action() -> Result<ExecutorAction, ApiError> {
    #[cfg(unix)]
    {
        let base_command = CursorAgent::base_command();

        // Install script with PATH setup
        let mut install_script = format!(
            r#"#!/bin/bash
set -e
if ! command -v {base_command} &> /dev/null; then
    echo "Installing Cursor CLI..."
    curl https://cursor.com/install -fsS | bash
    echo "Installation complete!"
else
    echo "Cursor CLI already installed"
fi"#
        );
        let shell = UnixShell::current_shell();
        if let Some(config_file) = shell.config_file()
            && let Ok(config_file_str) = try_quote(config_file.to_string_lossy().as_ref())
        {
            install_script.push_str(&format!(
                r#"
            echo "Setting up PATH..."
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> {config_file_str}
            "#
            ));
        }

        let install_request = ScriptRequest {
            script: install_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
        };
        // Second action (chained): Login
        let login_script = format!(
            r#"#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$PATH"
{base_command} login
"#
        );
        let login_request = ScriptRequest {
            script: login_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
        };

        // Chain them: install → login
        Ok(ExecutorAction::new(
            ExecutorActionType::ScriptRequest(install_request),
            Some(Box::new(ExecutorAction::new(
                ExecutorActionType::ScriptRequest(login_request),
                None,
            ))),
        ))
    }

    #[cfg(not(unix))]
    {
        use executors::executors::ExecutorError::SetupHelperNotSupported;
        Err(ApiError::Executor(SetupHelperNotSupported))
    }
}
