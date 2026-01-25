//! OpenCode slash command parsing, execution, and result formatting.
//!
//! This module is the central place for all slash command handling in OpenCode.
//! It defines the command enum, parses prompts, executes commands via the SDK,
//! and formats results as markdown.

use std::{
    collections::{HashMap, HashSet},
    future::Future,
    io,
    path::Path,
    pin::Pin,
};

use serde_json::Value;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::{
    sdk::{
        self, AgentInfo, CommandInfo, ConfigProvidersResponse, ConfigResponse, ControlEvent,
        EventListenerConfig, FormatterStatus, LogWriter, LspStatus, ProviderListResponse,
        RunConfig,
    },
    types::OpencodeExecutorEvent,
};
use crate::{
    env::{ExecutionEnv, RepoContext},
    executors::{
        BaseCodingAgent, ExecutorError, SlashCommandDescription,
        opencode::Opencode,
        utils::{
            SlashCommandCache, SlashCommandCacheKey, SlashCommandCall, parse_slash_command,
            reorder_slash_commands,
        },
    },
};

/// OpenCode slash command with known variants and custom fallback.
#[derive(Debug, Clone)]
pub enum OpencodeSlashCommand {
    Compact,
    Commands,
    Models {
        provider: Option<String>,
    },
    Agents,
    Status,
    Mcp,
    /// A custom command not in the built-in list.
    Custom {
        name: String,
        arguments: String,
    },
}

impl Opencode {
    pub async fn discover_slash_commands(
        &self,
        current_dir: &Path,
    ) -> Result<Vec<SlashCommandDescription>, ExecutorError> {
        let key = SlashCommandCacheKey::new(current_dir, &BaseCodingAgent::Opencode);
        if let Some(cached) = SlashCommandCache::instance().get(&key) {
            return Ok((*cached).clone());
        }

        let env = ExecutionEnv::new(RepoContext::default(), false);
        let server = self.spawn_server(current_dir, &env).await?;
        let commands = sdk::discover_commands(&server, current_dir).await?;

        let defaults = hardcoded_slash_commands();
        let mut seen: HashSet<String> = defaults.iter().map(|cmd| cmd.name.clone()).collect();

        let commands = commands
            .into_iter()
            .map(|cmd| {
                let name = cmd.name.trim_start_matches('/').to_string();
                SlashCommandDescription {
                    name,
                    description: cmd.description,
                }
            })
            .filter(|cmd| seen.insert(cmd.name.clone()))
            .chain(defaults)
            .collect::<Vec<_>>();

        let commands = reorder_slash_commands(commands);

        SlashCommandCache::instance().put(key, commands.clone());

        Ok(commands)
    }
}

impl OpencodeSlashCommand {
    /// Parse a prompt string into a slash command.
    pub fn parse(prompt: &str) -> Option<Self> {
        parse_slash_command(prompt)
    }

    /// Returns true if this command requires an existing session.
    pub fn requires_existing_session(&self) -> bool {
        matches!(self, Self::Compact)
    }

    /// Returns true if this command should fork the session.
    pub fn should_fork_session(&self) -> bool {
        true
    }
}

impl<'a> From<SlashCommandCall<'a>> for OpencodeSlashCommand {
    fn from(call: SlashCommandCall<'a>) -> Self {
        match call.name.as_str() {
            "compact" | "summarize" => Self::Compact,
            "commands" => Self::Commands,
            "models" => Self::Models {
                provider: call.arguments.split_whitespace().next().map(String::from),
            },
            "agents" => Self::Agents,
            "status" => Self::Status,
            "mcp" => Self::Mcp,
            _ => Self::Custom {
                name: call.name,
                arguments: call.arguments.to_string(),
            },
        }
    }
}

/// Build the list of hardcoded slash commands for discovery.
pub fn hardcoded_slash_commands() -> Vec<SlashCommandDescription> {
    vec![
        SlashCommandDescription {
            name: "compact".to_string(),
            description: Some("compact the session".to_string()),
        },
        SlashCommandDescription {
            name: "commands".to_string(),
            description: Some("show all commands".to_string()),
        },
        SlashCommandDescription {
            name: "models".to_string(),
            description: Some("list models".to_string()),
        },
        SlashCommandDescription {
            name: "agents".to_string(),
            description: Some("list agents".to_string()),
        },
        SlashCommandDescription {
            name: "status".to_string(),
            description: Some("show status".to_string()),
        },
        SlashCommandDescription {
            name: "mcp".to_string(),
            description: Some("show MCP status".to_string()),
        },
    ]
}

/// Format a list of commands as markdown.
fn format_commands(commands: &[CommandInfo]) -> String {
    if commands.is_empty() {
        return "_No commands available._".to_string();
    }

    let mut sorted = commands.to_vec();
    sorted.sort_by(|a, b| a.name.cmp(&b.name));

    let mut lines = vec!["## Available Commands".to_string(), String::new()];
    for command in sorted {
        let name = command.name.strip_prefix('/').unwrap_or(&command.name);
        let desc = command
            .description
            .as_ref()
            .filter(|d| !d.trim().is_empty())
            .map(|d| format!(" — {d}"))
            .unwrap_or_default();
        lines.push(format!("- `/{name}`{desc}"));
    }
    lines.join("\n")
}

/// Format a list of agents as markdown.
fn format_agents(agents: &[AgentInfo]) -> String {
    if agents.is_empty() {
        return "_No agents available._".to_string();
    }

    let mut sorted = agents.to_vec();
    sorted.sort_by(|a, b| a.name.cmp(&b.name));

    let mut lines = vec!["## Available Agents".to_string(), String::new()];
    for agent in sorted {
        let desc = agent
            .description
            .as_ref()
            .filter(|d| !d.trim().is_empty())
            .map(|d| format!(" — {d}"))
            .unwrap_or_default();
        lines.push(format!("- **{}**{desc}", agent.name));
    }
    lines.join("\n")
}

/// Format models list as markdown.
fn format_models(
    config_providers: &ConfigProvidersResponse,
    provider_list: Option<&ProviderListResponse>,
    provider_filter: Option<&str>,
) -> String {
    let mut providers: Vec<_> = config_providers.providers.iter().collect();
    providers.sort_by(|a, b| a.id.cmp(&b.id));

    if providers.is_empty() {
        return "_No models available._".to_string();
    }

    if let Some(filter) = provider_filter
        && !providers.iter().any(|p| p.id == filter)
    {
        return format!("_Provider not found: `{filter}`_");
    }

    let mut lines = vec!["## Models".to_string(), String::new()];

    for provider in providers {
        if let Some(filter) = provider_filter
            && provider.id != filter
        {
            continue;
        }

        let default_note = config_providers
            .default
            .get(&provider.id)
            .map(|m| format!(" (default: `{m}`)"))
            .unwrap_or_default();
        lines.push(format!("### {}{default_note}", provider.id));
        lines.push(String::new());

        let mut model_ids: Vec<_> = provider.models.keys().cloned().collect();
        model_ids.sort();
        for model_id in model_ids {
            lines.push(format!("- `{}/{model_id}`", provider.id));
        }
        lines.push(String::new());
    }

    if let Some(list) = provider_list
        && !list.connected.is_empty()
    {
        let mut connected = list.connected.clone();
        connected.sort();
        lines.push(format!("**Connected:** {}", connected.join(", ")));
    }

    lines.join("\n").trim_end().to_string()
}

/// Format status information as markdown.
fn format_status(
    mcp: &HashMap<String, Value>,
    lsp: &[LspStatus],
    formatter: &[FormatterStatus],
    config: &ConfigResponse,
) -> String {
    let mut sections = Vec::new();

    sections.push(format_mcp_section(mcp));
    sections.push(format_lsp_section(lsp));
    sections.push(format_formatter_section(formatter));

    let plugins = if config.plugin.is_empty() {
        "**Plugins:** _none_".to_string()
    } else {
        format!("**Plugins:** {}", config.plugin.join(", "))
    };
    sections.push(plugins);

    sections.join("\n\n")
}

/// Format MCP status as markdown.
fn format_mcp(mcp: &HashMap<String, Value>) -> String {
    format_mcp_section(mcp)
}

fn format_mcp_section(mcp: &HashMap<String, Value>) -> String {
    let mut lines = vec!["### MCP Servers".to_string(), String::new()];

    if mcp.is_empty() {
        lines.push("_No MCP servers configured._".to_string());
    } else {
        let mut names: Vec<_> = mcp.keys().cloned().collect();
        names.sort();

        for name in names {
            let entry = mcp.get(&name).unwrap_or(&Value::Null);
            let status = entry
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("unknown");

            let error_note = entry
                .get("error")
                .and_then(Value::as_str)
                .map(|e| format!(" — _{e}_"))
                .unwrap_or_default();

            lines.push(format!("- **{name}**: {status}{error_note}"));
        }
    }

    lines.join("\n")
}

fn format_lsp_section(lsp: &[LspStatus]) -> String {
    let mut lines = vec!["### LSP Servers".to_string(), String::new()];

    if lsp.is_empty() {
        lines.push("_No LSP servers active._".to_string());
    } else {
        let mut entries = lsp.to_vec();
        entries.sort_by(|a, b| a.name.cmp(&b.name));

        for entry in entries {
            lines.push(format!(
                "- **{}** ({}) — `{}`",
                entry.name, entry.status, entry.root
            ));
        }
    }

    lines.join("\n")
}

fn format_formatter_section(formatter: &[FormatterStatus]) -> String {
    let mut lines = vec!["### Formatters".to_string(), String::new()];

    if formatter.is_empty() {
        lines.push("_No formatters configured._".to_string());
    } else {
        let mut entries = formatter.to_vec();
        entries.sort_by(|a, b| a.name.cmp(&b.name));

        for entry in entries {
            let status = if entry.enabled { "enabled" } else { "disabled" };
            let extensions = if entry.extensions.is_empty() {
                String::new()
            } else {
                format!(" — {}", entry.extensions.join(", "))
            };
            lines.push(format!("- **{}** [{status}]{extensions}", entry.name));
        }
    }

    lines.join("\n")
}

/// Format a "command not found" message.
fn format_command_not_found(name: &str) -> String {
    format!("_Command not found: `/{name}`_")
}

/// Format a "no session" message.
fn format_no_session() -> String {
    "_No session available to run this command yet._".to_string()
}

/// Log a slash command result as an event.
async fn log_result(log_writer: &LogWriter, message: String) -> Result<(), ExecutorError> {
    log_writer.log_slash_command_result(message).await
}

/// Log completion of a slash command.
async fn log_done(log_writer: &LogWriter) -> Result<(), ExecutorError> {
    log_writer.log_event(&OpencodeExecutorEvent::Done).await
}

/// Log a result and mark as done.
async fn log_result_and_done(log_writer: &LogWriter, message: String) -> Result<(), ExecutorError> {
    log_result(log_writer, message).await?;
    log_done(log_writer).await
}

/// Execute a slash command using the OpenCode SDK.
pub async fn execute(
    config: RunConfig,
    command: OpencodeSlashCommand,
    log_writer: LogWriter,
    client: reqwest::Client,
    cancel: CancellationToken,
) -> Result<(), ExecutorError> {
    tokio::select! {
        _ = cancel.cancelled() => return Ok(()),
        res = sdk::wait_for_health(&client, &config.base_url) => res?,
    }

    // Handle commands that don't require a session first
    match &command {
        OpencodeSlashCommand::Commands => {
            let commands = sdk::list_commands(&client, &config.base_url, &config.directory).await?;
            log_result_and_done(&log_writer, format_commands(&commands)).await?;
            return Ok(());
        }
        OpencodeSlashCommand::Models { provider } => {
            let config_providers =
                sdk::list_config_providers(&client, &config.base_url, &config.directory).await?;
            let provider_list = sdk::list_providers(&client, &config.base_url, &config.directory)
                .await
                .ok();
            log_result_and_done(
                &log_writer,
                format_models(
                    &config_providers,
                    provider_list.as_ref(),
                    provider.as_deref(),
                ),
            )
            .await?;
            return Ok(());
        }
        OpencodeSlashCommand::Agents => {
            let agents = sdk::list_agents(&client, &config.base_url, &config.directory).await?;
            log_result_and_done(&log_writer, format_agents(&agents)).await?;
            return Ok(());
        }
        OpencodeSlashCommand::Status => {
            let mcp = sdk::mcp_status(&client, &config.base_url, &config.directory).await?;
            let lsp = sdk::lsp_status(&client, &config.base_url, &config.directory).await?;
            let formatter =
                sdk::formatter_status(&client, &config.base_url, &config.directory).await?;
            let cfg = sdk::config_get(&client, &config.base_url, &config.directory).await?;
            log_result_and_done(&log_writer, format_status(&mcp, &lsp, &formatter, &cfg)).await?;
            return Ok(());
        }
        OpencodeSlashCommand::Mcp => {
            let mcp = sdk::mcp_status(&client, &config.base_url, &config.directory).await?;
            log_result_and_done(&log_writer, format_mcp(&mcp)).await?;
            return Ok(());
        }
        // Session-dependent commands handled below
        OpencodeSlashCommand::Compact | OpencodeSlashCommand::Custom { .. } => {}
    }

    // Validate custom commands exist
    if let OpencodeSlashCommand::Custom { name, .. } = &command {
        let available = sdk::list_commands(&client, &config.base_url, &config.directory).await?;
        let normalized = name.trim_start_matches('/');
        if !available
            .iter()
            .any(|cmd| cmd.name.trim_start_matches('/') == normalized)
        {
            log_result_and_done(&log_writer, format_command_not_found(normalized)).await?;
            return Ok(());
        }
    }

    if command.requires_existing_session() && config.resume_session_id.is_none() {
        log_writer
            .log_slash_command_result(format_no_session())
            .await?;
        log_writer.log_event(&OpencodeExecutorEvent::Done).await?;
        return Ok(());
    }

    let session_id = match config.resume_session_id.as_deref() {
        Some(existing) if command.should_fork_session() => {
            tokio::select! {
                _ = cancel.cancelled() => return Ok(()),
                res = sdk::fork_session(&client, &config.base_url, &config.directory, existing) => res?,
            }
        }
        Some(existing) => existing.to_string(),
        None => tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            res = sdk::create_session(&client, &config.base_url, &config.directory) => res?,
        },
    };

    log_writer
        .log_event(&OpencodeExecutorEvent::SessionStart {
            session_id: session_id.clone(),
        })
        .await?;

    let is_compact = matches!(&command, OpencodeSlashCommand::Compact);
    let compaction_model = if is_compact {
        Some(
            sdk::resolve_compaction_model(
                &client,
                &config.base_url,
                &config.directory,
                config.model.as_deref(),
            )
            .await?,
        )
    } else {
        None
    };

    let (control_tx, mut control_rx) = mpsc::unbounded_channel::<ControlEvent>();
    let event_resp = tokio::select! {
        _ = cancel.cancelled() => return Ok(()),
        res = sdk::connect_event_stream(&client, &config.base_url, &config.directory, None) => res?,
    };
    let event_handle = tokio::spawn(sdk::spawn_event_listener(
        EventListenerConfig {
            client: client.clone(),
            base_url: config.base_url.clone(),
            directory: config.directory.clone(),
            session_id: session_id.clone(),
            log_writer: log_writer.clone(),
            approvals: config.approvals.clone(),
            auto_approve: config.auto_approve,
            control_tx,
            models_cache_key: config.models_cache_key.clone(),
        },
        event_resp,
    ));

    let request_client = client.clone();
    let request_base_url = config.base_url.clone();
    let request_directory = config.directory.clone();
    let request_session_id = session_id.clone();
    let request_agent = config.agent.clone();
    let request_model = config.model.clone();
    let request_model_variant = config.model_variant.clone();

    let request_fut: Pin<Box<dyn Future<Output = Result<(), ExecutorError>> + Send>> = match command
    {
        OpencodeSlashCommand::Compact => {
            let model = compaction_model.ok_or_else(|| {
                ExecutorError::Io(io::Error::other("OpenCode compaction model missing"))
            })?;
            Box::pin(async move {
                sdk::session_summarize(
                    &request_client,
                    &request_base_url,
                    &request_directory,
                    &request_session_id,
                    model,
                )
                .await
            })
        }
        OpencodeSlashCommand::Custom { name, arguments } => Box::pin(async move {
            sdk::session_command(
                &request_client,
                &request_base_url,
                &request_directory,
                &request_session_id,
                name,
                arguments,
                request_agent,
                request_model,
                request_model_variant,
            )
            .await
        }),
        _ => unreachable!("handled non-session commands earlier"),
    };

    let request_result =
        sdk::run_request_with_control(request_fut, &mut control_rx, cancel.clone()).await;

    if cancel.is_cancelled() {
        sdk::send_abort(&client, &config.base_url, &config.directory, &session_id).await;
        event_handle.abort();
        return Ok(());
    }

    event_handle.abort();

    request_result?;
    log_writer.log_event(&OpencodeExecutorEvent::Done).await?;

    Ok(())
}
