use std::{collections::HashMap, path::Path, sync::Arc};

use agent_client_protocol as proto;
use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use super::acp::AcpAgentHarness;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executor_discovery::ExecutorDiscoveredOptions,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
    installed_servers::{InstalledServers, ServerSource},
    logs::utils::patch,
    mcp_config,
    model_selector::{ModelSelectorConfig, PermissionPolicy},
    profile::ExecutorConfig,
    registry,
};

fn default_true() -> bool {
    true
}

/// Generic ACP server executor for any ACP-protocol agent.
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct AcpServerExecutor {
    #[serde(default, skip_serializing)]
    #[schemars(skip)]
    pub name: String,
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    /// Override the model name. Use this to pass an unadvertised model
    /// or set a persistent default that the model selector can override.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    /// For registry servers the command is provided automatically.
    /// For custom servers, set `base_command_override` to the ACP command.
    #[serde(default, flatten)]
    pub cmd: CmdOverrides,
    /// Runtime model override from the model selector (not serialized).
    #[serde(skip)]
    #[ts(skip)]
    #[schemars(skip)]
    runtime_model: Option<String>,
    /// Runtime agent/mode override from the model selector (not serialized).
    #[serde(skip)]
    #[ts(skip)]
    #[schemars(skip)]
    runtime_mode: Option<String>,
    /// Runtime reasoning/effort override from the model selector (not serialized).
    #[serde(skip)]
    #[ts(skip)]
    #[schemars(skip)]
    runtime_reasoning: Option<String>,
    /// When true, tool calls are auto-approved without user confirmation.
    /// Set from PermissionPolicy in apply_overrides(). Defaults to true (Auto).
    #[serde(skip, default = "default_true")]
    #[ts(skip)]
    #[schemars(skip)]
    auto_approve: bool,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl AcpServerExecutor {
    pub fn new() -> Self {
        Self {
            name: String::new(),
            append_prompt: AppendPrompt::default(),
            model_id: None,
            cmd: CmdOverrides::default(),
            runtime_model: None,
            runtime_mode: None,
            runtime_reasoning: None,
            auto_approve: true,
            approvals: None,
        }
    }

    pub fn with_name(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            append_prompt: AppendPrompt::default(),
            model_id: None,
            cmd: CmdOverrides::default(),
            runtime_model: None,
            runtime_mode: None,
            runtime_reasoning: None,
            auto_approve: true,
            approvals: None,
        }
    }

    /// Resolve command + env using the installed server registry.
    async fn resolve_command(&self) -> Result<(String, CmdOverrides), ExecutorError> {
        let mut env = self.cmd.env.clone().unwrap_or_default();

        let installed = InstalledServers::load().map_err(|e| {
            ExecutorError::UnknownExecutorType(format!("Failed to load installed servers: {e}"))
        })?;

        let server = installed.get(&self.name);

        let base_command = match server.map(|s| &s.source) {
            Some(ServerSource::Registry { registry_id }) => {
                if let Some(entry) = registry::get_entry(registry_id) {
                    if let Some(resolved) = registry::build_command_for_entry(&entry) {
                        let cmd = resolved.command_string();
                        env.extend(resolved.env);
                        Some(cmd)
                    } else if entry.distribution.binary.is_some() {
                        if let Some(resolved) = registry::ensure_binary_installed(&entry).await {
                            let cmd = resolved.command_string();
                            env.extend(resolved.env);
                            Some(cmd)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            Some(ServerSource::Custom) | None => self.cmd.base_command_override.clone(),
        };

        let command = base_command.ok_or_else(|| {
            ExecutorError::UnknownExecutorType(format!(
                "No command found for ACP server '{}'. Set a base_command_override \
                 or install from the registry.",
                self.name
            ))
        })?;

        let overrides = CmdOverrides {
            base_command_override: None,
            additional_params: self.cmd.additional_params.clone(),
            env: if env.is_empty() { None } else { Some(env) },
        };

        Ok((command, overrides))
    }

    /// Build an AcpAgentHarness with the effective model and mode.
    fn build_harness(&self) -> AcpAgentHarness {
        let mut harness = AcpAgentHarness::new();
        // Config-level model_id is the base default
        if let Some(model) = &self.model_id {
            harness = harness.with_model(model);
        }
        // Runtime overrides from apply_overrides() take precedence
        if let Some(model) = &self.runtime_model {
            harness = harness.with_model(model);
        }
        if let Some(mode) = &self.runtime_mode {
            harness = harness.with_mode(mode);
        }
        if let Some(reasoning) = &self.runtime_reasoning {
            harness = harness.with_reasoning(reasoning);
        }
        harness
    }

    pub fn registry_id(&self) -> Option<String> {
        InstalledServers::load().ok().and_then(|servers| {
            servers.get(&self.name).and_then(|s| match &s.source {
                ServerSource::Registry { registry_id } => Some(registry_id.clone()),
                ServerSource::Custom => None,
            })
        })
    }

    fn mcp_config_path(&self) -> std::path::PathBuf {
        workspace_utils::assets::acp_mcp_config_path(&self.name)
    }

    /// Load MCP servers from the per-server config file and convert to ACP protocol format.
    async fn load_mcp_servers(&self) -> Vec<proto::McpServer> {
        let path = self.mcp_config_path();
        let mcpc = self.get_mcp_config();
        let raw = match mcp_config::read_agent_config(&path, &mcpc).await {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };
        let servers = mcp_config::get_mcp_servers_from_config_path(&raw, &mcpc.servers_path);
        vk_mcp_to_acp(servers)
    }

    fn get_mcp_config(&self) -> mcp_config::McpConfig {
        use crate::executors::CodingAgent;
        // Reuse the standard mcpServers format with preconfigured defaults
        let preconfigured = CodingAgent::AcpServer(self.clone()).preconfigured_mcp();
        mcp_config::McpConfig::new(
            vec!["mcpServers".to_string()],
            serde_json::json!({ "mcpServers": {} }),
            preconfigured,
            false,
        )
    }
}

/// Convert VK-format MCP server configs to ACP protocol `McpServer` types.
fn vk_mcp_to_acp(servers: HashMap<String, Value>) -> Vec<proto::McpServer> {
    servers
        .into_iter()
        .filter_map(|(name, config)| {
            if let Some(cmd) = config.get("command").and_then(|v| v.as_str()) {
                // Stdio server
                let args: Vec<String> = config
                    .get("args")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                let env: Vec<proto::EnvVariable> = config
                    .get("env")
                    .and_then(|v| v.as_object())
                    .map(|m| {
                        m.iter()
                            .filter_map(|(k, v)| {
                                v.as_str().map(|val| proto::EnvVariable::new(k, val))
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                Some(proto::McpServer::Stdio(
                    proto::McpServerStdio::new(&name, cmd).args(args).env(env),
                ))
            } else if let Some(url) = config.get("url").and_then(|v| v.as_str()) {
                // HTTP or SSE server
                let headers: Vec<proto::HttpHeader> = config
                    .get("headers")
                    .and_then(|v| v.as_object())
                    .map(|m| {
                        m.iter()
                            .filter_map(|(k, v)| {
                                v.as_str().map(|val| proto::HttpHeader::new(k, val))
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let transport = config
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("http");
                if transport == "sse" {
                    Some(proto::McpServer::Sse(
                        proto::McpServerSse::new(&name, url).headers(headers),
                    ))
                } else {
                    Some(proto::McpServer::Http(
                        proto::McpServerHttp::new(&name, url).headers(headers),
                    ))
                }
            } else {
                None
            }
        })
        .collect()
}

impl Default for AcpServerExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for AcpServerExecutor {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        // Store runtime overrides from the model selector.
        // These are applied via ACP protocol (set_session_model/set_session_mode)
        // when the harness spawns the session.
        if let Some(model_id) = &executor_config.model_id {
            self.runtime_model = Some(model_id.clone());
        }
        if let Some(agent_id) = &executor_config.agent_id {
            self.runtime_mode = Some(agent_id.clone());
        }
        if let Some(reasoning_id) = &executor_config.reasoning_id {
            self.runtime_reasoning = Some(reasoning_id.clone());
        }
        if let Some(permission_policy) = &executor_config.permission_policy {
            self.auto_approve = matches!(permission_policy, PermissionPolicy::Auto);
        }
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (cmd_str, cmd_overrides) = self.resolve_command().await?;
        let builder = CommandBuilder::new(&cmd_str);
        let builder = apply_overrides(builder, &cmd_overrides)?;
        let command_parts = builder.build_initial()?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mcp_servers = self.load_mcp_servers().await;
        let harness = self.build_harness().with_mcp_servers(mcp_servers);
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                command_parts,
                env,
                &cmd_overrides,
                self.approvals.clone(),
                self.auto_approve,
            )
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (cmd_str, cmd_overrides) = self.resolve_command().await?;
        let builder = CommandBuilder::new(&cmd_str);
        let builder = apply_overrides(builder, &cmd_overrides)?;
        let command_parts = builder.build_follow_up(&[])?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mcp_servers = self.load_mcp_servers().await;
        let harness = self.build_harness().with_mcp_servers(mcp_servers);
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                command_parts,
                env,
                &cmd_overrides,
                self.approvals.clone(),
                self.auto_approve,
            )
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        // Suppress noisy stderr patterns from specific agents
        let registry_id = self.registry_id();
        let suppressed: &[&str] = match registry_id.as_deref() {
            Some("gemini") => &[
                "was started but never ended. Skipping metrics.",
                "YOLO mode is enabled. All tool calls will be automatically approved.",
                "MCP error",
                "Scheduling MCP context refresh",
                "Executing MCP context refresh",
                "MCP context refresh complete",
                "Registering notification handlers",
                "supports tool updates",
                "has tools but did not declare",
            ],
            _ => &[],
        };
        super::acp::normalize_logs_with_suppressed_stderr_patterns(
            msg_store,
            worktree_path,
            suppressed,
        )
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        Some(self.mcp_config_path())
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // For now, report as found -- the actual availability is determined at spawn time
        AvailabilityInfo::InstallationFound
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: crate::executors::BaseCodingAgent::from_str_raw(&self.name),
            variant: None,
            model_id: self.model_id.clone(),
            agent_id: None,
            reasoning_id: None,
            permission_policy: Some(PermissionPolicy::Auto),
        }
    }

    async fn discover_options(
        &self,
        workdir: Option<&Path>,
        repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        use crate::{
            executor_discovery::ExecutorConfigCacheKey, executors::utils::executor_options_cache,
        };

        let cache = executor_options_cache();
        let op = super::acp::harness::gen_op_id();
        let span = tracing::debug_span!("acp_discover", server = %self.name, op = %op);
        let cmd_key = self.name.clone();
        let base_executor = crate::executors::BaseCodingAgent::from_str_raw(&self.name);

        fn default_loading_options() -> ExecutorDiscoveredOptions {
            ExecutorDiscoveredOptions {
                model_selector: ModelSelectorConfig {
                    permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
                    ..Default::default()
                },
                loading_models: true,
                loading_agents: true,
                ..Default::default()
            }
        }

        let (target_path, initial_options) = if let Some(wd) = workdir {
            let wd_buf = wd.to_path_buf();
            let target_key =
                ExecutorConfigCacheKey::new(Some(&wd_buf), cmd_key.clone(), base_executor.clone());
            if let Some(cached) = cache.get(&target_key) {
                span.in_scope(|| {
                    tracing::debug!(
                        cache_hit = true,
                        level = "workdir",
                        commands = cached.slash_commands.len(),
                        models = cached.model_selector.models.len(),
                        agents = cached.model_selector.agents.len(),
                        "acp_discover.done"
                    )
                });
                return Ok(Box::pin(futures::stream::once(async move {
                    patch::executor_discovered_options(cached.as_ref().clone().with_loading(false))
                })));
            }
            let provisional = repo_path
                .and_then(|rp| {
                    let rp_buf = rp.to_path_buf();
                    let repo_key = ExecutorConfigCacheKey::new(
                        Some(&rp_buf),
                        cmd_key.clone(),
                        base_executor.clone(),
                    );
                    cache.get(&repo_key)
                })
                .or_else(|| {
                    let global_key =
                        ExecutorConfigCacheKey::new(None, cmd_key.clone(), base_executor.clone());
                    cache.get(&global_key)
                });
            (
                Some(wd.to_path_buf()),
                provisional
                    .map(|p| {
                        let mut opts = p.as_ref().clone();
                        opts.loading_models = true;
                        opts.loading_agents = true;
                        opts
                    })
                    .unwrap_or_else(default_loading_options),
            )
        } else if let Some(rp) = repo_path {
            let rp_buf = rp.to_path_buf();
            let target_key =
                ExecutorConfigCacheKey::new(Some(&rp_buf), cmd_key.clone(), base_executor.clone());
            if let Some(cached) = cache.get(&target_key) {
                span.in_scope(|| {
                    tracing::debug!(
                        cache_hit = true,
                        level = "repo",
                        commands = cached.slash_commands.len(),
                        models = cached.model_selector.models.len(),
                        agents = cached.model_selector.agents.len(),
                        "acp_discover.done"
                    )
                });
                return Ok(Box::pin(futures::stream::once(async move {
                    patch::executor_discovered_options(cached.as_ref().clone().with_loading(false))
                })));
            }
            let global_key =
                ExecutorConfigCacheKey::new(None, cmd_key.clone(), base_executor.clone());
            let provisional = cache.get(&global_key);
            (
                Some(rp.to_path_buf()),
                provisional
                    .map(|p| {
                        let mut opts = p.as_ref().clone();
                        opts.loading_models = true;
                        opts.loading_agents = true;
                        opts
                    })
                    .unwrap_or_else(default_loading_options),
            )
        } else {
            let global_key =
                ExecutorConfigCacheKey::new(None, cmd_key.clone(), base_executor.clone());
            if let Some(cached) = cache.get(&global_key) {
                span.in_scope(|| {
                    tracing::debug!(
                        cache_hit = true,
                        level = "global",
                        commands = cached.slash_commands.len(),
                        models = cached.model_selector.models.len(),
                        agents = cached.model_selector.agents.len(),
                        "acp_discover.done"
                    )
                });
                return Ok(Box::pin(futures::stream::once(async move {
                    patch::executor_discovered_options(cached.as_ref().clone().with_loading(false))
                })));
            }
            (None, default_loading_options())
        };

        let initial_patch = patch::executor_discovered_options(initial_options);

        // Probe the ACP server for models/modes by spawning a temp session
        let discovery_path = target_path
            .as_deref()
            .unwrap_or(Path::new("."))
            .to_path_buf();
        let (cmd_str, cmd_overrides) = self.resolve_command().await?;
        let builder = CommandBuilder::new(&cmd_str);
        let builder = apply_overrides(builder, &cmd_overrides)?;
        let command_parts = builder.build_initial()?;

        let probed = {
            let _enter = span.enter(); // Enter span so probe captures it
            super::acp::harness::probe_session_metadata(
                command_parts,
                &discovery_path,
                &cmd_overrides,
            )
        } // _enter dropped here, before .await
        .await;

        // Build discovery result from probe
        let discovered = if let Some(probe) = probed {
            let model_selector = super::acp::discovery::translate_to_model_selector_with_reasoning(
                probe.modes.as_ref(),
                probe.models.as_ref(),
                probe.config_options.as_deref(),
                Some(&probe.per_model_reasoning),
            );
            let slash_commands =
                super::acp::discovery::translate_available_commands(&probe.commands);
            ExecutorDiscoveredOptions {
                model_selector,
                slash_commands,
                ..Default::default()
            }
        } else {
            span.in_scope(|| tracing::debug!("acp_discover.probe result=none"));
            ExecutorDiscoveredOptions {
                model_selector: ModelSelectorConfig {
                    permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
                    ..Default::default()
                },
                ..Default::default()
            }
        };

        // Cache at target path level and global level
        if let Some(path) = &target_path {
            let target_cache_key =
                ExecutorConfigCacheKey::new(Some(path), cmd_key.clone(), base_executor.clone());
            cache.put(target_cache_key, discovered.clone());
        }
        let global_cache_key = ExecutorConfigCacheKey::new(None, cmd_key, base_executor);
        cache.put(global_cache_key, discovered.clone());

        span.in_scope(|| {
            tracing::debug!(
                cache_hit = false,
                models = discovered.model_selector.models.len(),
                agents = discovered.model_selector.agents.len(),
                commands = discovered.slash_commands.len(),
                "acp_discover.done"
            )
        });

        Ok(Box::pin(futures::stream::iter(vec![
            initial_patch,
            patch::executor_discovered_options(discovered),
        ])))
    }
}
