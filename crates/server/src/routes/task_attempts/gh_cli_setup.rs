use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    task_attempt::TaskAttempt,
};
use deployment::Deployment;
use executors::actions::ExecutorAction;
#[cfg(unix)]
use executors::{
    actions::{
        ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::ExecutorError,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;

use crate::{error::ApiError, routes::task_attempts::ensure_worktree_path};

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GhCliSetupError {
    BrewMissing,
    SetupHelperNotSupported,
    Other { message: String },
}

pub async fn run_gh_cli_setup(
    deployment: &crate::DeploymentImpl,
    task_attempt: &TaskAttempt,
) -> Result<ExecutionProcess, ApiError> {
    let executor_action = get_gh_cli_setup_helper_action().await?;

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

async fn get_gh_cli_setup_helper_action() -> Result<ExecutorAction, ApiError> {
    #[cfg(unix)]
    {
        use utils::shell::resolve_executable_path;

        if resolve_executable_path("brew").await.is_none() {
            return Err(ApiError::Executor(ExecutorError::ExecutableNotFound {
                program: "brew".to_string(),
            }));
        }

        // Install script
        let install_script = r#"#!/bin/bash
set -e
if ! command -v gh &> /dev/null; then
    echo "Installing GitHub CLI..."
    brew install gh
    echo "Installation complete!"
else
    echo "GitHub CLI already installed"
fi"#
        .to_string();

        let install_request = ScriptRequest {
            script: install_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
        };

        // Auth script
        let auth_script = r#"#!/bin/bash
set -e
export GH_PROMPT_DISABLED=1
gh auth login --web --git-protocol https --skip-ssh-key
"#
        .to_string();

        let auth_request = ScriptRequest {
            script: auth_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
        };

        // Chain them: install → auth
        Ok(ExecutorAction::new(
            ExecutorActionType::ScriptRequest(install_request),
            Some(Box::new(ExecutorAction::new(
                ExecutorActionType::ScriptRequest(auth_request),
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
