use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    session::{CreateSession, Session},
    workspace::{Workspace, WorkspaceError},
};
use deployment::Deployment;
use executors::actions::ExecutorAction;
#[cfg(unix)]
use executors::{
    actions::{
        ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::kiro::Kiro,
};
use services::services::container::ContainerService;
use uuid::Uuid;

use crate::error::ApiError;

pub async fn run_kiro_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
    _kiro: &Kiro,
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
        get_setup_helper_action()
            .await?
            .append_action(latest_action.to_owned())
    } else {
        get_setup_helper_action().await?
    };
    deployment
        .container()
        .ensure_container_exists(workspace)
        .await?;

    // Get or create a session for setup scripts
    let session =
        match Session::find_latest_by_workspace_id(&deployment.db().pool, workspace.id).await? {
            Some(s) => s,
            None => {
                Session::create(
                    &deployment.db().pool,
                    &CreateSession {
                        executor: Some("kiro".to_string()),
                    },
                    Uuid::new_v4(),
                    workspace.id,
                )
                .await?
            }
        };

    let execution_process = ExecutionProcess::create(
        &deployment.db().pool,
        session.id,
        workspace.id,
        &ExecutionProcessRunReason::CodingAgent,
        executor_action,
    )
    .await?;

    Ok(execution_process)
}

#[cfg(unix)]
async fn get_setup_helper_action() -> Result<ExecutorAction, ApiError> {
    // Install script only - login disabled for now
    let install_script = r#"#!/bin/bash
set -e
echo "Installing Kiro CLI..."
if ! command -v kiro-cli &> /dev/null; then
    curl -fsSL https://cli.kiro.dev/install | bash
    echo "Kiro CLI installed successfully"
else
    echo "Kiro CLI already installed"
fi
echo "Note: Please run 'kiro-cli login' manually to authenticate"
"#;

    let install_request = ScriptRequest {
        script: install_script.to_string(),
        language: ScriptRequestLanguage::Bash,
        context: ScriptContext::ToolInstallScript,
        working_dir: None,
    };

    // Only install, no login
    Ok(ExecutorAction::new(
        ExecutorActionType::ScriptRequest(install_request),
        None,
    ))
}

#[cfg(not(unix))]
async fn get_setup_helper_action() -> Result<ExecutorAction, ApiError> {
    Err(ApiError::Executor(
        executors::executors::ExecutorError::UnsupportedPlatform,
    ))
}
