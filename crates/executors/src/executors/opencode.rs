use std::{path::Path, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use derivative::Derivative;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::{io::AsyncBufReadExt, process::Command};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, SpawnedChild,
        StandardCodingAgentExecutor, opencode::types::OpencodeExecutorEvent,
    },
    logs::utils::patch,
    stdout_dup::create_stdout_pipe_writer,
};

mod models;
mod normalize_logs;
mod sdk;
mod slash_commands;
mod types;

use sdk::{LogWriter, RunConfig, generate_server_password, run_session, run_slash_command};
use slash_commands::{OpencodeSlashCommand, hardcoded_slash_commands};

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
    /// Enable auto-compaction when the context length approaches the model's context window limit
    #[serde(default = "default_to_true")]
    pub auto_compact: bool,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

/// Represents a spawned OpenCode server with its base URL
struct OpencodeServer {
    #[allow(unused)]
    child: AsyncGroupChild,
    base_url: String,
    server_password: ServerPassword,
}

type ServerPassword = String;

impl Opencode {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y opencode-ai@1.1.25")
            // Pass hostname/port as separate args so OpenCode treats them as explicitly set
            // (it checks `process.argv.includes(\"--port\")` / `\"--hostname\"`).
            .extend_params(["serve", "--hostname", "127.0.0.1", "--port", "0"]);
        apply_overrides(builder, &self.cmd)
    }

    /// Compute a cache key for model context windows based on configuration that can affect the list of available models.
    fn compute_models_cache_key(&self) -> String {
        serde_json::to_string(&self.cmd).unwrap_or_default()
    }

    /// Common boilerplate for spawning an OpenCode server process.
    async fn spawn_server_process(
        &self,
        current_dir: &Path,
        env: &ExecutionEnv,
    ) -> Result<(AsyncGroupChild, ServerPassword), ExecutorError> {
        let command_parts = self.build_command_builder()?.build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let server_password = generate_server_password();

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1")
            .env("OPENCODE_SERVER_PASSWORD", &server_password)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let child = command.group_spawn()?;

        Ok((child, server_password))
    }

    /// Handles process spawning, waiting for the server URL
    async fn spawn_server(
        &self,
        current_dir: &Path,
        env: &ExecutionEnv,
    ) -> Result<OpencodeServer, ExecutorError> {
        let (mut child, server_password) = self.spawn_server_process(current_dir, env).await?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("OpenCode server missing stdout"))
        })?;

        let base_url = wait_for_server_url(server_stdout, None).await?;

        Ok(OpencodeServer {
            child,
            base_url,
            server_password,
        })
    }

    async fn spawn_inner(
        &self,
        current_dir: &Path,
        prompt: &str,
        resume_session: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let slash_command = OpencodeSlashCommand::parse(prompt);
        let combined_prompt = if slash_command.is_some() {
            prompt.to_string()
        } else {
            self.append_prompt.combine_prompt(prompt)
        };

        let (mut child, server_password) = self.spawn_server_process(current_dir, env).await?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("OpenCode server missing stdout"))
        })?;

        let stdout = create_stdout_pipe_writer(&mut child)?;
        let log_writer = LogWriter::new(stdout);

        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();
        let (interrupt_tx, interrupt_rx) = tokio::sync::oneshot::channel();

        // Prepare config values that will be moved into the spawned task
        let directory = current_dir.to_string_lossy().to_string();
        let approvals = if self.auto_approve {
            None
        } else {
            self.approvals.clone()
        };
        let model = self.model.clone();
        let model_variant = self.variant.clone();
        let agent = self.mode.clone();
        let auto_approve = self.auto_approve;
        let resume_session_id = resume_session.map(|s| s.to_string());
        let models_cache_key = self.compute_models_cache_key();

        tokio::spawn(async move {
            // Wait for server to print listening URL
            let base_url = match wait_for_server_url(server_stdout, Some(log_writer.clone())).await
            {
                Ok(url) => url,
                Err(err) => {
                    let _ = log_writer
                        .log_error(format!("OpenCode startup error: {err}"))
                        .await;
                    let _ = exit_signal_tx.send(ExecutorExitResult::Failure);
                    return;
                }
            };

            let config = RunConfig {
                base_url,
                directory,
                prompt: combined_prompt,
                resume_session_id,
                model,
                model_variant,
                agent,
                approvals,
                auto_approve,
                server_password,
                models_cache_key,
            };

            let result = match slash_command {
                Some(command) => {
                    run_slash_command(config, log_writer.clone(), command, interrupt_rx).await
                }
                None => run_session(config, log_writer.clone(), interrupt_rx).await,
            };
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

async fn wait_for_server_url(
    stdout: tokio::process::ChildStdout,
    log_writer: Option<LogWriter>,
) -> Result<String, ExecutorError> {
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

        if let Some(log_writer) = &log_writer {
            log_writer
                .log_event(&OpencodeExecutorEvent::StartupLog {
                    message: line.clone(),
                })
                .await?;
        }
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

    async fn available_slash_commands(
        &self,
        current_dir: &Path,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let defaults = hardcoded_slash_commands();
        let this = self.clone();
        let current_dir = current_dir.to_path_buf();

        let initial = patch::slash_commands(defaults.clone(), true, None);

        let discovery_stream = futures::stream::once(async move {
            match this.discover_slash_commands(&current_dir).await {
                Ok(commands) => patch::slash_commands(commands, false, None),
                Err(e) => {
                    tracing::warn!("Failed to discover OpenCode slash commands: {}", e);
                    patch::slash_commands(defaults, false, Some(e.to_string()))
                }
            }
        });

        Ok(Box::pin(
            futures::stream::once(async move { initial }).chain(discovery_stream),
        ))
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let env = setup_permissions_env(self.auto_approve, env);
        let env = setup_compaction_env(self.auto_compact, &env);
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
        let env = setup_compaction_env(self.auto_compact, &env);
        self.spawn_inner(current_dir, prompt, Some(session_id), &env)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize_logs::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // Try multiple config file names (.json and .jsonc) in XDG/platform config dirs
        #[cfg(unix)]
        {
            let base_dirs = xdg::BaseDirectories::with_prefix("opencode");
            // First try opencode.json, then opencode.jsonc
            base_dirs
                .get_config_file("opencode.json")
                .filter(|p| p.exists())
                .or_else(|| base_dirs.get_config_file("opencode.jsonc"))
        }
        #[cfg(not(unix))]
        {
            dirs::config_dir().and_then(|config| {
                let opencode_dir = config.join("opencode");
                let json_path = opencode_dir.join("opencode.json");
                let jsonc_path = opencode_dir.join("opencode.jsonc");
                if json_path.exists() {
                    Some(json_path)
                } else {
                    Some(jsonc_path)
                }
            })
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        // Check multiple installation indicator paths:
        // 1. XDG config dir: ~/.config/opencode (Unix)
        // 2. Platform config dir: ~/Library/Application Support/opencode (macOS)
        // 3. OpenCode Desktop app: ~/Library/Application Support/ai.opencode.desktop (macOS)
        // 4. OpenCode CLI home: ~/.opencode (cross-platform)
        let installation_indicator_found = {
            // Check XDG/platform config directory
            let config_dir_exists = dirs::config_dir()
                .map(|config| config.join("opencode").exists())
                .unwrap_or(false);

            // Check OpenCode Desktop app directory (macOS)
            let desktop_app_exists = dirs::config_dir()
                .map(|config| config.join("ai.opencode.desktop").exists())
                .unwrap_or(false);

            // Check ~/.opencode directory (CLI installation)
            let home_opencode_exists = dirs::home_dir()
                .map(|home| home.join(".opencode").exists())
                .unwrap_or(false);

            config_dir_exists || desktop_app_exists || home_opencode_exists
        };

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

fn setup_compaction_env(auto_compact: bool, env: &ExecutionEnv) -> ExecutionEnv {
    if !auto_compact {
        return env.clone();
    }

    let mut env = env.clone();
    let merged = merge_compaction_config(env.get("OPENCODE_CONFIG_CONTENT").map(String::as_str));
    env.insert("OPENCODE_CONFIG_CONTENT", merged);
    env
}

fn merge_compaction_config(existing_json: Option<&str>) -> String {
    let mut config: Map<String, Value> = existing_json
        .and_then(|value| serde_json::from_str(value.trim()).ok())
        .unwrap_or_default();

    let mut compaction = config
        .remove("compaction")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    compaction.insert("auto".to_string(), Value::Bool(true));
    config.insert("compaction".to_string(), Value::Object(compaction));

    serde_json::to_string(&config).unwrap_or_else(|_| r#"{"compaction":{"auto":true}}"#.to_string())
}
