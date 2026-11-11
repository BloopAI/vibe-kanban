use db::models::{execution_process::ExecutionProcess, workspace::Workspace};
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    command::{CommandBuilder, apply_overrides},
    executors::{ExecutorError, codex::Codex},
};

use super::agent_setup::start_agent_setup;
use crate::error::ApiError;

pub async fn run_codex_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
    codex: &Codex,
) -> Result<ExecutionProcess, ApiError> {
    let setup_action = get_setup_helper_action(codex).await?;
    start_agent_setup(deployment, workspace, setup_action, "codex").await
}

async fn get_setup_helper_action(codex: &Codex) -> Result<ExecutorAction, ApiError> {
    let mut login_command = CommandBuilder::new(Codex::base_command());
    login_command = login_command.extend_params(["login"]);
    login_command = apply_overrides(login_command, &codex.cmd)?;

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
