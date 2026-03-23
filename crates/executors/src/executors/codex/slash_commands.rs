use std::path::{Path, PathBuf};

use codex_app_server_protocol::{ConfigEdit, JSONRPCNotification, MergeStrategy};
use codex_protocol::{
    config_types::ServiceTier,
    protocol::{AgentMessageEvent, ErrorEvent, EventMsg},
};
use serde_json::json;

use super::{
    Codex,
    client::{AppServerClient, LogWriter},
    codex_home, fork_params_from, resolve_model,
};
use crate::{
    env::ExecutionEnv,
    executors::{
        ExecutorError, ExecutorExitResult, SpawnedChild,
        utils::{SlashCommandCall, parse_slash_command},
    },
    stdout_dup::spawn_local_output_process,
};

const CODEX_INIT_PROMPT: &str = include_str!("init_prompt.md");
const DEFAULT_PROJECT_DOC_FILENAME: &str = "AGENTS.md";

#[derive(Debug, Clone)]
pub enum CodexSlashCommand {
    Init,
    Compact { instructions: Option<String> },
    Status,
    Mcp,
    Fast { enable: Option<bool> },
}

impl CodexSlashCommand {
    pub fn parse(prompt: &str) -> Option<Self> {
        let cmd: SlashCommandCall<'_> = parse_slash_command(prompt)?;
        match cmd.name.as_str() {
            "init" => Some(Self::Init),
            "compact" => Some(Self::Compact {
                instructions: if cmd.arguments.is_empty() {
                    None
                } else {
                    Some(cmd.arguments.to_string())
                },
            }),
            "status" => Some(Self::Status),
            "mcp" => Some(Self::Mcp),
            "fast" => Some(Self::Fast {
                enable: match cmd.arguments.trim() {
                    "on" | "true" | "1" | "yes" | "enable" => Some(true),
                    "off" | "false" | "0" | "no" | "disable" => Some(false),
                    _ => None,
                },
            }),
            _ => None,
        }
    }
}

impl Codex {
    pub async fn spawn_slash_command(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        if let Some(command) = CodexSlashCommand::parse(prompt) {
            return match command {
                CodexSlashCommand::Init => {
                    let init_target = current_dir.join(DEFAULT_PROJECT_DOC_FILENAME);
                    if init_target.exists() {
                        let message = format!(
                            "`{DEFAULT_PROJECT_DOC_FILENAME}` already exists. Skipping `/init` to avoid overwriting it."
                        );
                        self.return_static_reply(current_dir, Ok(message)).await
                    } else {
                        self.spawn_agent_with_prompt(
                            current_dir,
                            CODEX_INIT_PROMPT,
                            session_id,
                            env,
                        )
                        .await
                    }
                }
                CodexSlashCommand::Compact { .. } => match session_id {
                    Some(_) => {
                        self.handle_app_server_slash_command(current_dir, command, session_id, env)
                            .await
                    }
                    None => {
                        self.return_static_reply(
                            current_dir,
                            Ok("_No active session to compact._".to_string()),
                        )
                        .await
                    }
                },
                CodexSlashCommand::Status => {
                    self.handle_app_server_slash_command(current_dir, command, session_id, env)
                        .await
                }
                CodexSlashCommand::Mcp => {
                    self.handle_app_server_slash_command(current_dir, command, None, env)
                        .await
                }
                CodexSlashCommand::Fast { .. } => {
                    self.handle_app_server_slash_command(current_dir, command, session_id, env)
                        .await
                }
            };
        }

        self.spawn_agent_with_prompt(current_dir, prompt, session_id, env)
            .await
    }

    async fn spawn_agent_with_prompt(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = match session_id {
            Some(_) => self.build_command_builder()?.build_follow_up(&[])?,
            None => self.build_command_builder()?.build_initial()?,
        };
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let action = super::CodexSessionAction::Chat {
            prompt: combined_prompt,
        };
        self.spawn_inner(current_dir, command_parts, action, session_id, env)
            .await
    }

    // Handle slash commands that require interaction with the app server
    async fn handle_app_server_slash_command(
        &self,
        current_dir: &Path,
        command: CodexSlashCommand,
        session_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_parts = self.build_command_builder()?.build_initial()?;
        let session_id = session_id.map(|s| s.to_string());
        let (_, session_fast) = resolve_model(self.model.as_deref());
        let thread_start_params = self.build_thread_start_params(current_dir);

        self.spawn_app_server(
            current_dir,
            command_parts,
            env,
            move |client, exit_signal_tx| async move {
                match command {
                    CodexSlashCommand::Compact { .. } => {
                        let old_thread_id = session_id.ok_or_else(|| {
                            ExecutorError::Io(std::io::Error::other("No active session to compact"))
                        })?;
                        let fork_response = client
                            .thread_fork(fork_params_from(old_thread_id, thread_start_params))
                            .await?;
                        let thread_id = fork_response.thread.id;
                        tracing::debug!("forked thread for compact, new thread_id={thread_id}");
                        client.thread_compact_start(thread_id).await?;
                    }
                    CodexSlashCommand::Status => {
                        let message =
                            fetch_status_message(&client, session_id.as_deref(), session_fast)
                                .await?;
                        log_event_raw(client.log_writer(), message).await?;
                        exit_signal_tx
                            .send_exit_signal(ExecutorExitResult::Success)
                            .await;
                    }
                    CodexSlashCommand::Mcp => {
                        let message = fetch_mcp_status_message(&client).await?;
                        log_event_raw(client.log_writer(), message).await?;
                        exit_signal_tx
                            .send_exit_signal(ExecutorExitResult::Success)
                            .await;
                    }
                    CodexSlashCommand::Fast { enable } => {
                        // Read current config to support toggle
                        let current_is_fast = client
                            .config_read(None)
                            .await
                            .ok()
                            .and_then(|r| r.config.service_tier)
                            .map(|t| matches!(t, ServiceTier::Fast))
                            .unwrap_or(false);
                        let want_fast = match enable {
                            Some(v) => v,
                            None => !current_is_fast, // toggle
                        };
                        // Persist service_tier to codex config via config/batchWrite
                        let config_value = if want_fast {
                            json!("fast")
                        } else {
                            json!(null)
                        };
                        let _ = client
                            .config_batch_write(vec![ConfigEdit {
                                key_path: "service_tier".to_string(),
                                value: config_value,
                                merge_strategy: MergeStrategy::Replace,
                            }])
                            .await;
                        // Fork current session with new tier if one is active
                        if let Some(old_thread_id) = session_id {
                            let service_tier = if want_fast {
                                Some(Some(ServiceTier::Fast))
                            } else {
                                Some(None)
                            };
                            let mut fork_params =
                                fork_params_from(old_thread_id, thread_start_params);
                            fork_params.service_tier = service_tier;
                            let _ = client.thread_fork(fork_params).await;
                        }
                        let message = if want_fast {
                            "**Fast mode enabled.** Inference runs at higher speed (2× plan usage)."
                                .to_string()
                        } else {
                            "**Fast mode disabled.**".to_string()
                        };
                        log_event_raw(client.log_writer(), message).await?;
                        exit_signal_tx
                            .send_exit_signal(ExecutorExitResult::Success)
                            .await;
                    }
                    _ => {
                        return Err(ExecutorError::Io(std::io::Error::other(
                            "Unsupported Codex slash command",
                        )));
                    }
                }

                Ok(())
            },
        )
        .await
    }

    pub async fn return_static_reply(
        &self,
        current_dir: &Path,
        message: Result<String, String>,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.spawn_static_reply_helper(
            current_dir,
            vec![match message {
                Ok(message) => EventMsg::AgentMessage(AgentMessageEvent {
                    message,
                    phase: None,
                }),
                Err(message) => EventMsg::Error(ErrorEvent {
                    message,
                    codex_error_info: None,
                }),
            }],
        )
        .await
    }

    // Helper to spawn a process whose sole purpose is to channel back a static reply
    pub async fn spawn_static_reply_helper(
        &self,
        _current_dir: &Path,
        events: Vec<EventMsg>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (mut spawned, writer) = spawn_local_output_process()?;
        let log_writer = LogWriter::new(writer);
        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();

        tokio::spawn(async move {
            let mut exit_result = ExecutorExitResult::Success;
            for event in events {
                if let Err(err) = log_event_notification(&log_writer, event).await {
                    tracing::error!("Failed to emit slash command output: {err}");
                    exit_result = ExecutorExitResult::Failure;
                    break;
                }
            }
            let _ = exit_signal_tx.send(exit_result);
        });

        spawned.exit_signal = Some(exit_signal_rx);
        Ok(spawned)
    }
}

pub async fn log_event_notification(
    log_writer: &LogWriter,
    event: EventMsg,
) -> Result<(), ExecutorError> {
    let event = match event {
        EventMsg::SessionConfigured(mut configured) => {
            configured.initial_messages = None;
            EventMsg::SessionConfigured(configured)
        }
        other => other,
    };
    let notification = JSONRPCNotification {
        method: "codex/event".to_string(),
        params: Some(json!({ "msg": event })),
    };
    let raw = serde_json::to_string(&notification)
        .map_err(|err| ExecutorError::Io(std::io::Error::other(err.to_string())))?;
    log_writer.log_raw(&raw).await
}

pub async fn log_event_raw(log_writer: &LogWriter, message: String) -> Result<(), ExecutorError> {
    log_event_notification(
        log_writer,
        EventMsg::AgentMessage(AgentMessageEvent {
            message,
            phase: None,
        }),
    )
    .await
}

async fn fetch_status_message(
    client: &AppServerClient,
    thread_id: Option<&str>,
    session_fast: bool,
) -> Result<String, ExecutorError> {
    let mut lines = vec!["# Session Status\n".to_string()];

    let rollout = match thread_id {
        Some(tid) => read_rollout_data(tid).await,
        None => None,
    };

    let config_resp = client.config_read(None).await.ok();

    lines.push("## Configuration".to_string());
    if let Some(ctx) = rollout.as_ref().and_then(|r| r.turn_context.as_ref()) {
        if let Some(model) = &ctx.model {
            lines.push(format!("- **Model**: `{model}`"));
        }
        if let Some(policy) = &ctx.approval_policy {
            lines.push(format!("- **Approvals**: `{policy}`"));
        }
        if let Some(sandbox) = &ctx.sandbox_policy {
            let label = sandbox
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            lines.push(format!("- **Sandbox**: `{label}`"));
        }
        let effort = ctx.effort.as_deref().unwrap_or("default");
        let summary = ctx.summary.as_deref().unwrap_or("auto");
        lines.push(format!(
            "- **Reasoning**: effort: `{effort}` summary: `{summary}`"
        ));
    } else if let Some(ref resp) = config_resp {
        let cfg = &resp.config;
        if let Some(model) = &cfg.model {
            lines.push(format!("- **Model**: `{model}`"));
        }
        if let Some(provider) = &cfg.model_provider {
            lines.push(format!("- **Provider**: `{provider}`"));
        }
        if let Some(policy) = &cfg.approval_policy {
            lines.push(format!("- **Approvals**: `{policy:?}`"));
        }
        if let Some(sandbox) = &cfg.sandbox_mode {
            lines.push(format!("- **Sandbox**: `{sandbox:?}`"));
        }
        if let Some(effort) = &cfg.model_reasoning_effort {
            lines.push(format!("- **Reasoning effort**: `{effort}`"));
        }
        if let Some(summary) = &cfg.model_reasoning_summary {
            lines.push(format!("- **Reasoning summary**: `{summary:?}`"));
        }
    } else {
        lines.push("_Config unavailable_".to_string());
    }

    // Show fast mode
    let global_fast = config_resp
        .as_ref()
        .and_then(|r| r.config.service_tier.as_ref())
        .map(|t| matches!(t, ServiceTier::Fast))
        .unwrap_or(false);
    if global_fast || session_fast {
        lines.push("- **Service Tier**: `fast ⚡`".to_string());
    }

    // Thread info
    if let Some(thread_id) = thread_id {
        lines.push(String::new());
        lines.push("## Thread".to_string());
        match client.thread_read(thread_id.to_string()).await {
            Ok(resp) => {
                let thread = &resp.thread;
                lines.push(format!("- **ID**: `{}`", thread.id));
                if let Some(name) = &thread.name {
                    lines.push(format!("- **Name**: {name}"));
                }
                lines.push(format!("- **CWD**: `{}`", thread.cwd.display()));
                lines.push(format!("- **CLI version**: `{}`", thread.cli_version));
                let source_label = format!("{:?}", thread.source).replace("VsCode", "Vibe Kanban");
                lines.push(format!("- **Source**: `{source_label}`"));
            }
            Err(err) => {
                lines.push(format!("_Thread info unavailable: {err}_"));
            }
        }
    }

    // Token usage (best-effort from rollout file)
    if let Some(rollout) = &rollout {
        lines.push(String::new());
        lines.push("## Token Usage".to_string());
        if let Some(info) = &rollout.token_usage {
            let total = &info.total_token_usage;
            let last = &info.last_token_usage;
            lines.push(format!("**Total**: `{}`", total.total_tokens));
            lines.push(format!(
                "  - Input: `{}` | Output: `{}` | Reasoning: `{}` | Cached: `{}`",
                total.input_tokens,
                total.output_tokens,
                total.reasoning_output_tokens,
                total.cached_input_tokens,
            ));
            lines.push(format!("\n**Last Turn**: `{}`", last.total_tokens));
            lines.push(format!(
                "  - Input: `{}` | Output: `{}` | Reasoning: `{}` | Cached: `{}`",
                last.input_tokens,
                last.output_tokens,
                last.reasoning_output_tokens,
                last.cached_input_tokens,
            ));
            if let Some(window) = info.model_context_window {
                lines.push(format!("\n**Context Window**: `{window}`"));
            }
        } else {
            lines.push("_Token usage unavailable_".to_string());
        }
    }

    match client.get_account_rate_limits().await {
        Ok(resp) => {
            let rl = &resp.rate_limits;
            lines.push(String::new());
            lines.push("## Rate Limits".to_string());
            if let Some(plan) = &rl.plan_type {
                lines.push(format!("- **Plan**: `{plan:?}`"));
            }
            if let Some(primary) = &rl.primary {
                lines.push(format!("- **Primary**: `{}%` used", primary.used_percent));
            }
            if let Some(secondary) = &rl.secondary {
                lines.push(format!(
                    "- **Secondary**: `{}%` used",
                    secondary.used_percent
                ));
            }
            if let Some(credits) = &rl.credits {
                let balance = credits.balance.as_deref().unwrap_or(if credits.unlimited {
                    "unlimited"
                } else {
                    "none"
                });
                lines.push(format!("- **Credits**: `{balance}`"));
            }
        }
        Err(err) => {
            tracing::debug!("rate limits unavailable: {err}");
        }
    }

    Ok(lines.join("\n"))
}

#[derive(serde::Deserialize)]
struct RolloutEntry {
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(default)]
    payload: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct TokenCountPayload {
    info: Option<RolloutTokenUsageInfo>,
}

#[derive(serde::Deserialize)]
struct RolloutTokenUsageInfo {
    total_token_usage: RolloutTokenUsage,
    last_token_usage: RolloutTokenUsage,
    model_context_window: Option<u64>,
}

#[derive(serde::Deserialize)]
struct RolloutTokenUsage {
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    total_tokens: u64,
}

#[derive(serde::Deserialize)]
struct TurnContextPayload {
    model: Option<String>,
    approval_policy: Option<String>,
    sandbox_policy: Option<serde_json::Value>,
    effort: Option<String>,
    summary: Option<String>,
}

struct RolloutData {
    turn_context: Option<TurnContextPayload>,
    token_usage: Option<RolloutTokenUsageInfo>,
}

async fn read_rollout_data(session_id: &str) -> Option<RolloutData> {
    let sessions_dir = codex_home()?.join("sessions");
    let rollout_path = find_rollout_file(&sessions_dir, session_id).await?;

    let file = tokio::fs::File::open(&rollout_path).await.ok()?;
    let reader = tokio::io::BufReader::new(file);

    let mut last_turn_context: Option<TurnContextPayload> = None;
    let mut last_token_usage: Option<RolloutTokenUsageInfo> = None;

    use tokio::io::AsyncBufReadExt;
    let mut lines = reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let entry: RolloutEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        match entry.entry_type.as_str() {
            "turn_context" => {
                if let Ok(ctx) = serde_json::from_value::<TurnContextPayload>(entry.payload) {
                    last_turn_context = Some(ctx);
                }
            }
            "event_msg" => {
                if let Ok(tc) = serde_json::from_value::<TokenCountPayload>(entry.payload)
                    && tc.info.is_some()
                {
                    last_token_usage = tc.info;
                }
            }
            _ => {}
        }
    }

    Some(RolloutData {
        turn_context: last_turn_context,
        token_usage: last_token_usage,
    })
}

async fn find_rollout_file(dir: &Path, session_id: &str) -> Option<PathBuf> {
    let mut entries = tokio::fs::read_dir(dir).await.ok()?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = Box::pin(find_rollout_file(&path, session_id)).await {
                return Some(found);
            }
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str())
            && name.starts_with("rollout-")
            && name.contains(session_id)
            && name.ends_with(".jsonl")
        {
            return Some(path);
        }
    }
    None
}

async fn fetch_mcp_status_message(client: &AppServerClient) -> Result<String, ExecutorError> {
    let mut cursor = None;
    let mut servers = Vec::new();
    loop {
        let response = client.list_mcp_server_status(cursor).await?;
        servers.extend(response.data);
        cursor = response.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    Ok(format_mcp_status(&servers))
}

fn format_mcp_status(servers: &[codex_app_server_protocol::McpServerStatus]) -> String {
    if servers.is_empty() {
        return "_No MCP servers configured._".to_string();
    }
    let mut lines = vec![format!("# MCP Servers ({})\n", servers.len())];
    for server in servers {
        let auth = format_mcp_auth_status(&server.auth_status);
        lines.push(format!("## {}", server.name));
        lines.push(format!("- **Auth**: `{auth}`"));

        let mut tools: Vec<String> = server.tools.keys().cloned().collect();
        tools.sort();
        if tools.is_empty() {
            lines.push("- **Tools**: _none_".to_string());
        } else {
            lines.push(format!("- **Tools**: `{}`", tools.join("`, `")));
        }

        if !server.resources.is_empty() {
            let mut names: Vec<String> = server
                .resources
                .iter()
                .map(|res| res.name.clone())
                .collect();
            names.sort();
            lines.push(format!("- **Resources**: `{}`", names.join("`, `")));
        }

        if !server.resource_templates.is_empty() {
            let mut names: Vec<String> = server
                .resource_templates
                .iter()
                .map(|template| template.name.clone())
                .collect();
            names.sort();
            lines.push(format!(
                "- **Resource Templates**: `{}`",
                names.join("`, `")
            ));
        }

        lines.push(String::new()); // Empty line between servers
    }
    lines.join("\n")
}

fn format_mcp_auth_status(status: &codex_app_server_protocol::McpAuthStatus) -> &'static str {
    match status {
        codex_app_server_protocol::McpAuthStatus::Unsupported => "unsupported",
        codex_app_server_protocol::McpAuthStatus::NotLoggedIn => "not logged in",
        codex_app_server_protocol::McpAuthStatus::BearerToken => "bearer token",
        codex_app_server_protocol::McpAuthStatus::OAuth => "oauth",
    }
}
