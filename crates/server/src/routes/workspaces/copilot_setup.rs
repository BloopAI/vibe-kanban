use std::path::Path;

use db::models::{execution_process::ExecutionProcess, workspace::Workspace};
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    command::CommandBuildError,
    executors::{ExecutorError, copilot::Copilot},
};

use super::agent_setup::start_agent_setup;
use crate::error::ApiError;

pub async fn run_copilot_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
    copilot: &Copilot,
) -> Result<ExecutionProcess, ApiError> {
    let setup_action = get_setup_helper_action(copilot).await?;
    start_agent_setup(deployment, workspace, setup_action, "copilot").await
}

async fn get_setup_helper_action(copilot: &Copilot) -> Result<ExecutorAction, ApiError> {
    let (program, args) = copilot
        .login_command()
        .await
        .build_initial()
        .map_err(|err| ApiError::Executor(ExecutorError::from(err)))?
        .into_resolved()
        .await
        .map_err(ApiError::Executor)?;
    let script = login_script(&program, &args)
        .map_err(|err| ApiError::Executor(ExecutorError::from(err)))?;

    Ok(ExecutorAction::new(
        ExecutorActionType::ScriptRequest(ScriptRequest {
            script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
            working_dir: None,
        }),
        None,
    ))
}

/// The login command line, with no env: the script is saved in the database and shown in the
/// output, and profile env can hold tokens. Copilot's sign-in doesn't depend on env anyway.
fn login_script(program: &Path, args: &[String]) -> Result<String, CommandBuildError> {
    let program = program.to_string_lossy();
    let parts = std::iter::once(program.as_ref()).chain(args.iter().map(String::as_str));
    if cfg!(windows) {
        Ok(parts.collect::<Vec<_>>().join(" "))
    } else {
        let quoted = parts.map(shlex::try_quote).collect::<Result<Vec<_>, _>>()?;
        Ok(quoted.join(" "))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn login_script_quotes_paths_with_spaces() {
        let script = login_script(
            Path::new("/Users/a b/.nvm/bin/npx"),
            &[
                "-y".into(),
                "@github/copilot@1.0.108".into(),
                "login".into(),
                "--device-code".into(),
            ],
        )
        .unwrap();
        assert_eq!(
            script,
            "'/Users/a b/.nvm/bin/npx' -y @github/copilot@1.0.108 login --device-code"
        );
    }
}
