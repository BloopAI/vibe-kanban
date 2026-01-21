use std::{path::Path, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Map;
use tokio::{io::AsyncBufReadExt, process::Command};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    stdout_dup::create_stdout_pipe_writer,
};

mod normalize_logs;
mod sdk;
mod types;

use sdk::{LogWriter, RunConfig, run_session};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "agent")]
    pub mode: Option<String>,
    /// Auto-approve agent actions
    #[serde(default = "default_to_true")]
    pub auto_approve: bool,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Opencode {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y opencode-ai@1.1.25")
            // Pass hostname/port as separate args so OpenCode treats them as explicitly set
            // (it checks `process.argv.includes(\"--port\")` / `\"--hostname\"`).
            .extend_params(["serve", "--hostname", "127.0.0.1", "--port", "0"]);
        apply_overrides(builder, &self.cmd)
    }

    async fn spawn_inner(
        &self,
        current_dir: &Path,
        prompt: &str,
        resume_session: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let command_parts = self.build_command_builder()?.build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .args(&args)
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1");

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other(
                "OpenCode server missing stdout (needed to parse listening URL)",
            ))
        })?;

        let stdout = create_stdout_pipe_writer(&mut child)?;
        let log_writer = LogWriter::new(stdout);

        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();
        let (interrupt_tx, interrupt_rx) = tokio::sync::oneshot::channel();

        let directory = current_dir.to_string_lossy().to_string();
        let base_url = wait_for_server_url(server_stdout).await?;
        let approvals = if self.auto_approve {
            None
        } else {
            self.approvals.clone()
        };

        let config = RunConfig {
            base_url,
            directory,
            prompt: combined_prompt,
            resume_session_id: resume_session.map(|s| s.to_string()),
            model: self.model.clone(),
            model_variant: self.variant.clone(),
            agent: self.mode.clone(),
            approvals,
            auto_approve: self.auto_approve,
        };

        tokio::spawn(async move {
            let result = run_session(config, log_writer.clone(), interrupt_rx).await;
            let exit_result = match result {
                Ok(()) => ExecutorExitResult::Success,
                Err(err) => {
                    let _ = log_writer
                        .log_error(format!("OpenCode executor error: {err}"))
                        .await;
                    ExecutorExitResult::Failure
                }
            };
            let _ = exit_signal_tx.send(exit_result);
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
            interrupt_sender: Some(interrupt_tx),
        })
    }
}

fn format_tail(captured: Vec<String>) -> String {
    captured
        .into_iter()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

async fn wait_for_server_url(stdout: tokio::process::ChildStdout) -> Result<String, ExecutorError> {
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(180);
    let mut captured: Vec<String> = Vec::new();

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(ExecutorError::Io(std::io::Error::other(format!(
                "Timed out waiting for OpenCode server to print listening URL.\nServer output tail:\n{}",
                format_tail(captured)
            ))));
        }

        let line = match tokio::time::timeout_at(deadline, lines.next_line()).await {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => {
                return Err(ExecutorError::Io(std::io::Error::other(format!(
                    "OpenCode server exited before printing listening URL.\nServer output tail:\n{}",
                    format_tail(captured)
                ))));
            }
            Ok(Err(err)) => return Err(ExecutorError::Io(err)),
            Err(_) => continue,
        };

        if captured.len() < 64 {
            captured.push(line.clone());
        }

        if let Some(url) = line.trim().strip_prefix("opencode server listening on ") {
            // Keep draining stdout to avoid backpressure on the server, but don't block startup.
            tokio::spawn(async move {
                let mut lines = tokio::io::BufReader::new(lines.into_inner()).lines();
                while let Ok(Some(_)) = lines.next_line().await {}
            });
            return Ok(url.trim().to_string());
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let env = setup_permissions_env(self.auto_approve, env);
        self.spawn_inner(current_dir, prompt, None, &env).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let env = setup_permissions_env(self.auto_approve, env);
        self.spawn_inner(current_dir, prompt, Some(session_id), &env)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize_logs::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        #[cfg(unix)]
        {
            xdg::BaseDirectories::with_prefix("opencode").get_config_file("opencode.json")
        }
        #[cfg(not(unix))]
        {
            dirs::config_dir().map(|config| config.join("opencode").join("opencode.json"))
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::config_dir()
            .map(|config| config.join("opencode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

fn default_to_true() -> bool {
    true
}

fn setup_permissions_env(auto_approve: bool, env: &ExecutionEnv) -> ExecutionEnv {
    let mut env = env.clone();

    let permissions = match env.get("OPENCODE_PERMISSION") {
        Some(existing) => merge_question_deny(existing),
        None => build_default_permissions(auto_approve),
    };

    env.insert("OPENCODE_PERMISSION", &permissions);
    env
}

fn build_default_permissions(auto_approve: bool) -> String {
    if auto_approve {
        r#"{"question":"deny"}"#.to_string()
    } else {
        r#"{"edit":"ask","bash":"ask","webfetch":"ask","doom_loop":"ask","external_directory":"ask","question":"deny"}"#.to_string()
    }
}

fn merge_question_deny(existing_json: &str) -> String {
    let mut permissions: Map<String, serde_json::Value> =
        serde_json::from_str(existing_json.trim()).unwrap_or_default();

    permissions.insert(
        "question".to_string(),
        serde_json::Value::String("deny".to_string()),
    );

    serde_json::to_string(&permissions).unwrap_or_else(|_| r#"{"question":"deny"}"#.to_string())
}
