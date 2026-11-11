use db::models::{execution_process::ExecutionProcess, workspace::Workspace};
use executors::actions::ExecutorAction;
#[cfg(unix)]
use executors::{
    actions::{
        ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::cursor::CursorAgent,
};

use super::agent_setup::start_agent_setup;
use crate::error::ApiError;

pub async fn run_cursor_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
) -> Result<ExecutionProcess, ApiError> {
    let setup_action = get_setup_helper_action().await?;
    start_agent_setup(deployment, workspace, setup_action, "cursor").await
}

async fn get_setup_helper_action() -> Result<ExecutorAction, ApiError> {
    #[cfg(unix)]
    {
        use shlex::try_quote;
        use utils::shell::UnixShell;
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
            working_dir: None,
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
            working_dir: None,
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
