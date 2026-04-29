use std::path::Path;

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
    executors::{ExecutorError, codex::Codex},
};
use services::services::container::ContainerService;
use uuid::Uuid;

use crate::error::ApiError;

pub async fn run_codex_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
    codex: &Codex,
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
        get_setup_helper_action(codex)
            .await?
            .append_action(latest_action.to_owned())
    } else {
        get_setup_helper_action(codex).await?
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
                // Create a new session for setup scripts
                Session::create(
                    &deployment.db().pool,
                    &CreateSession {
                        executor: Some("codex".to_string()),
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
    let login_script = script_command_line(&program_path, &args);
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

fn script_command_line(program_path: &Path, args: &[String]) -> String {
    std::iter::once(program_path.to_string_lossy().into_owned())
        .chain(args.iter().cloned())
        .map(|arg| quote_script_arg(&arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn quote_script_arg(arg: &str) -> String {
    if cfg!(windows) {
        quote_cmd_arg(arg)
    } else {
        quote_posix_arg(arg)
    }
}

fn quote_cmd_arg(arg: &str) -> String {
    if arg.is_empty()
        || arg
            .chars()
            .any(|ch| {
                ch.is_whitespace()
                    || matches!(ch, '"' | '&' | '|' | '<' | '>' | '^' | '(' | ')')
            })
    {
        format!("\"{}\"", arg.replace('"', "\\\""))
    } else {
        arg.to_string()
    }
}

fn quote_posix_arg(arg: &str) -> String {
    if arg.is_empty()
        || arg
            .chars()
            .any(|ch| ch.is_whitespace() || matches!(ch, '\'' | '"' | '\\' | '$' | '`'))
    {
        format!("'{}'", arg.replace('\'', "'\\''"))
    } else {
        arg.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_windows_cmd_program_files_paths() {
        assert_eq!(
            quote_cmd_arg(r#"C:\Program Files\nodejs\npx.cmd"#),
            r#""C:\Program Files\nodejs\npx.cmd""#
        );
    }

    #[test]
    fn quotes_posix_arguments_with_spaces() {
        assert_eq!(
            quote_posix_arg("/Applications/OpenAI Codex/bin/codex"),
            "'/Applications/OpenAI Codex/bin/codex'"
        );
    }

    #[test]
    fn setup_command_line_preserves_argument_boundaries() {
        let args = vec![
            "-y".to_string(),
            "--package".to_string(),
            "@openai/codex@0.124.0".to_string(),
            "codex".to_string(),
            "login".to_string(),
            "--flag=value with spaces".to_string(),
        ];
        let line = script_command_line(Path::new(r#"C:\Program Files\nodejs\npx.cmd"#), &args);

        if cfg!(windows) {
            assert_eq!(
                line,
                r#""C:\Program Files\nodejs\npx.cmd" -y --package @openai/codex@0.124.0 codex login "--flag=value with spaces""#
            );
        } else {
            assert_eq!(
                line,
                r#"'C:\Program Files\nodejs\npx.cmd' -y --package @openai/codex@0.124.0 codex login '--flag=value with spaces'"#
            );
        }
    }
}
