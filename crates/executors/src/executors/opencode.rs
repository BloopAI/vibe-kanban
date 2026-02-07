use std::{
    cmp::Ordering,
    path::{Path, PathBuf},
    sync::{Arc, OnceLock},
    time::Duration,
};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use convert_case::{Case, Casing};
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
    env::{ExecutionEnv, RepoContext},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult,
        ExecutorSessionOverrides, SlashCommandDescription, SpawnedChild,
        StandardCodingAgentExecutor,
        opencode::types::OpencodeExecutorEvent,
        utils::{
            DEFAULT_CACHE_TTL, SLASH_COMMANDS_CACHE_CAPACITY, TtlCache, reorder_slash_commands,
        },
    },
    logs::utils::patch,
    model_selector::{
        AgentInfo, ModelInfo, ModelProvider, ModelSelectorConfig, PermissionPolicy, PresetOptions,
        ReasoningOption,
    },
    stdout_dup::create_stdout_pipe_writer,
};

mod models;
mod normalize_logs;
mod sdk;
mod slash_commands;
mod types;

use sdk::{
    AgentInfo as SDKAgentInfo, LogWriter, RunConfig, build_authenticated_client,
    generate_server_password, list_agents, list_commands, run_session, run_slash_command,
};
use slash_commands::{OpencodeSlashCommand, hardcoded_slash_commands};
use types::{Config, ProviderListResponse, ProviderModelInfo};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mode")]
    pub agent: Option<String>,
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
    child: Option<AsyncGroupChild>,
    base_url: String,
    server_password: ServerPassword,
}

impl Drop for OpencodeServer {
    fn drop(&mut self) {
        // kill the process properly using the kill helper as the native kill_on_drop doesn't work reliably causing orphaned processes and memory leaks
        if let Some(mut child) = self.child.take() {
            tokio::spawn(async move {
                let _ = workspace_utils::process::kill_process_group(&mut child).await;
            });
        }
    }
}

type ServerPassword = String;
const DISCOVERY_CACHE_CAPACITY: usize = SLASH_COMMANDS_CACHE_CAPACITY;

/// model list and slash commands retrieved and cached
#[derive(Clone, Debug)]
struct OpencodeDiscovery {
    slash_commands: Vec<SlashCommandDescription>,
    model_config: ModelSelectorConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct OpencodeDiscoveryCacheKey {
    path: PathBuf,
    cmd_key: String,
    auto_approve: bool,
}

fn discovery_cache() -> &'static TtlCache<OpencodeDiscoveryCacheKey, OpencodeDiscovery> {
    static INSTANCE: OnceLock<TtlCache<OpencodeDiscoveryCacheKey, OpencodeDiscovery>> =
        OnceLock::new();
    INSTANCE.get_or_init(|| TtlCache::new(DISCOVERY_CACHE_CAPACITY, DEFAULT_CACHE_TTL))
}

impl Opencode {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y opencode-ai@1.1.51")
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
            .env("OPENCODE_SERVER_USERNAME", "opencode")
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
            child: Some(child),
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
        let cancel = tokio_util::sync::CancellationToken::new();

        // Prepare config values that will be moved into the spawned task
        let directory = current_dir.to_string_lossy().to_string();
        let approvals = if self.auto_approve {
            None
        } else {
            self.approvals.clone()
        };
        let model = self.model.clone();
        let model_variant = self.variant.clone();
        let agent = self.agent.clone();
        let auto_approve = self.auto_approve;
        let resume_session_id = resume_session.map(|s| s.to_string());
        let models_cache_key = self.compute_models_cache_key();
        let cancel_for_task = cancel.clone();
        let commit_reminder = env.commit_reminder;
        let commit_reminder_prompt = env.commit_reminder_prompt.clone();
        let repo_context = env.repo_context.clone();

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
                commit_reminder,
                commit_reminder_prompt,
                repo_context,
            };

            let result = match slash_command {
                Some(command) => {
                    run_slash_command(config, log_writer.clone(), command, cancel_for_task).await
                }
                None => run_session(config, log_writer.clone(), cancel_for_task).await,
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
            cancel: Some(cancel),
        })
    }

    // Discover models, agents, and slash commands
    async fn discover_config(
        &self,
        current_dir: &Path,
    ) -> Result<OpencodeDiscovery, ExecutorError> {
        let cache_key = OpencodeDiscoveryCacheKey {
            path: current_dir.to_path_buf(),
            cmd_key: self.compute_models_cache_key(),
            auto_approve: self.auto_approve,
        };
        if let Some(cached) = discovery_cache().get(&cache_key) {
            return Ok(cached.as_ref().clone());
        }

        let env = ExecutionEnv::new(RepoContext::default(), false, String::new());
        let env = setup_permissions_env(self.auto_approve, &env);

        // Spawn server and wait for URL
        let server = self.spawn_server(current_dir, &env).await?;
        let directory = current_dir.to_string_lossy();

        // Build authenticated client (reusing SDK pattern - Basic Auth)
        let client = build_authenticated_client(&directory, &server.server_password)?;

        // Fetch slash commands
        let raw_commands = list_commands(&client, &server.base_url, &directory).await?;
        let defaults = hardcoded_slash_commands();
        let mut seen: std::collections::HashSet<String> =
            defaults.iter().map(|cmd| cmd.name.clone()).collect();
        let discovered: Vec<SlashCommandDescription> = raw_commands
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
            .collect();
        let slash_commands = reorder_slash_commands(discovered);

        // Fetch /config endpoint for global model
        let config_response = client
            .get(format!("{}/config", server.base_url))
            .query(&[("directory", directory.as_ref())])
            .send()
            .await
            .map_err(|e| {
                ExecutorError::Io(std::io::Error::other(format!("HTTP request failed: {e}")))
            })?;

        let config: Config = if config_response.status().is_success() {
            config_response.json().await.map_err(|e| {
                ExecutorError::Io(std::io::Error::other(format!(
                    "Failed to parse config response: {e}"
                )))
            })?
        } else {
            Config { model: None }
        };

        // Fetch /provider endpoint
        let response = client
            .get(format!("{}/provider", server.base_url))
            .query(&[("directory", directory.as_ref())])
            .send()
            .await
            .map_err(|e| {
                ExecutorError::Io(std::io::Error::other(format!("HTTP request failed: {e}")))
            })?;

        if !response.status().is_success() {
            return Err(ExecutorError::Io(std::io::Error::other(format!(
                "Provider API returned status {}",
                response.status()
            ))));
        }

        let data: ProviderListResponse = response.json().await.map_err(|e| {
            ExecutorError::Io(std::io::Error::other(format!(
                "Failed to parse provider response: {e}"
            )))
        })?;

        let default_model = config.model;

        let agents = match list_agents(&client, &server.base_url, &directory).await {
            Ok(agents) => agents,
            Err(err) => {
                tracing::warn!("Failed to list OpenCode agents: {}", err);
                Vec::new()
            }
        };

        models::seed_context_windows_cache(
            &self.compute_models_cache_key(),
            models::extract_context_windows(&data),
        );

        let model_config = self.transform_provider_response(data, &agents, default_model)?;

        let result = OpencodeDiscovery {
            slash_commands,
            model_config,
        };

        discovery_cache().put(cache_key, result.clone());

        Ok(result)
    }

    /// Transform the raw provider response into a ModelSelectorConfig.
    fn transform_provider_response(
        &self,
        data: ProviderListResponse,
        agents: &[SDKAgentInfo],
        default_model: Option<String>,
    ) -> Result<ModelSelectorConfig, ExecutorError> {
        // Build providers list - only include connected providers
        let providers: Vec<ModelProvider> = data
            .all
            .iter()
            .filter(|p| data.connected.contains(&p.id))
            .map(|p| ModelProvider {
                id: p.id.clone(),
                name: p.name.clone(),
            })
            .collect();

        // Gather models for all connected providers (UI filters by provider).
        let models: Vec<ModelInfo> = data
            .all
            .iter()
            .filter(|p| data.connected.contains(&p.id))
            .flat_map(|p| self.transform_models(&p.models, &p.id))
            .collect();

        let agent_options = map_opencode_agents(agents);

        Ok(ModelSelectorConfig {
            providers,
            models,
            agents: agent_options,
            permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
            loading: false,
            error: None,
            default_model,
        })
    }

    /// Transform raw model data into ModelInfo structs.
    fn transform_models(
        &self,
        models: &std::collections::HashMap<String, ProviderModelInfo>,
        provider_id: &str,
    ) -> Vec<ModelInfo> {
        let mut ordered = models.values().collect::<Vec<_>>();
        ordered.sort_by(|a, b| match (&a.release_date, &b.release_date) {
            (Some(a_date), Some(b_date)) => b_date.cmp(a_date),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => a.name.cmp(&b.name),
        });

        ordered
            .into_iter()
            .map(|m| {
                let reasoning_options = m
                    .variants
                    .as_ref()
                    .map(|variants| ReasoningOption::from_names(variants.keys().cloned()))
                    .unwrap_or_default();

                ModelInfo {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    provider_id: Some(provider_id.to_string()),
                    reasoning_options,
                }
            })
            .collect()
    }
}

fn map_opencode_agents(agents: &[SDKAgentInfo]) -> Vec<AgentInfo> {
    agents
        .iter()
        .map(|agent| AgentInfo {
            id: agent.name.clone(),
            label: agent.name.to_case(Case::Title),
            description: agent.description.clone(),
            is_default: agent.name.to_lowercase() == "build",
        })
        .collect()
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
    fn apply_session_overrides(&mut self, overrides: &ExecutorSessionOverrides) {
        if let Some(model_id) = &overrides.model_id {
            self.model = Some(model_id.clone());
        }

        if let Some(agent_id) = &overrides.agent_id {
            self.agent = Some(agent_id.clone());
        }

        if let Some(permission_policy) = overrides.permission_policy.clone() {
            self.auto_approve = matches!(permission_policy, PermissionPolicy::Auto);
        }

        if let Some(reasoning_id) = &overrides.reasoning_id {
            self.variant = Some(reasoning_id.clone());
        }
    }

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
            match this.discover_config(&current_dir).await {
                Ok(discovery) => patch::slash_commands(discovery.slash_commands, false, None),
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
        _reset_to_message_id: Option<&str>,
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
        #[cfg(not(windows))]
        {
            let base_dirs = xdg::BaseDirectories::with_prefix("opencode");
            // First try opencode.json, then opencode.jsonc
            base_dirs
                .get_config_file("opencode.json")
                .filter(|p| p.exists())
                .or_else(|| base_dirs.get_config_file("opencode.jsonc"))
        }
        #[cfg(windows)]
        {
            let config_dir = std::env::var("XDG_CONFIG_HOME")
                .map(std::path::PathBuf::from)
                .ok()
                .or_else(|| dirs::home_dir().map(|p| p.join(".config")))
                .map(|p| p.join("opencode"))?;

            let path = Some(config_dir.join("opencode.json"))
                .filter(|p| p.exists())
                .unwrap_or_else(|| config_dir.join("opencode.jsonc"));
            Some(path)
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        // Check multiple installation indicator paths:
        // 1. XDG config dir: $XDG_CONFIG_HOME/opencode
        // 2. XDG data dir: $XDG_DATA_HOME/opencode
        // 3. XDG state dir: $XDG_STATE_HOME/opencode
        // 4. OpenCode CLI home: ~/.opencode
        #[cfg(not(windows))]
        let installation_indicator_found = {
            let base_dirs = xdg::BaseDirectories::with_prefix("opencode");

            let config_dir_exists = base_dirs
                .get_config_home()
                .map(|config| config.exists())
                .unwrap_or(false);

            let data_dir_exists = base_dirs
                .get_data_home()
                .map(|data| data.exists())
                .unwrap_or(false);

            let state_dir_exists = base_dirs
                .get_state_home()
                .map(|state| state.exists())
                .unwrap_or(false);

            config_dir_exists || data_dir_exists || state_dir_exists
        };

        #[cfg(windows)]
        let installation_indicator_found = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .map(std::path::PathBuf::from)
            .and_then(|p| p.join("opencode").exists().then_some(()))
            .or_else(|| {
                dirs::home_dir()
                    .and_then(|p| p.join(".config").join("opencode").exists().then_some(()))
            })
            .is_some();

        let home_opencode_exists = dirs::home_dir()
            .map(|home| home.join(".opencode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found || home_opencode_exists {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    async fn available_model_config(
        &self,
        workdir: &Path,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let cache_key = OpencodeDiscoveryCacheKey {
            path: workdir.to_path_buf(),
            cmd_key: self.compute_models_cache_key(),
            auto_approve: self.auto_approve,
        };
        let cached_config = discovery_cache()
            .get(&cache_key)
            .map(|entry| entry.model_config.clone());

        let initial_patch = if let Some(config) = cached_config.clone() {
            patch::model_selector_config(config, false, None)
        } else {
            let initial_config = ModelSelectorConfig {
                loading: true,
                ..Default::default()
            };
            patch::model_selector_config(initial_config, true, None)
        };

        let this = self.clone();
        let workdir = workdir.to_path_buf();

        let fetch_stream = futures::stream::once(async move {
            match this.discover_config(&workdir).await {
                Ok(discovery) => patch::model_selector_config(discovery.model_config, false, None),
                Err(e) => {
                    tracing::warn!("Failed to fetch OpenCode model config: {}", e);
                    let mut error_config = cached_config.unwrap_or_default();
                    error_config.error = Some(e.to_string());
                    error_config.loading = false;
                    patch::model_selector_config(error_config, false, Some(e.to_string()))
                }
            }
        });

        Ok(Box::pin(
            futures::stream::once(async move { initial_patch }).chain(fetch_stream),
        ))
    }

    fn get_preset_options(&self) -> PresetOptions {
        PresetOptions {
            model_id: self.model.clone(),
            agent_id: self.agent.clone(),
            reasoning_id: self.variant.clone(),
            permission_policy: if self.auto_approve {
                PermissionPolicy::Auto
            } else {
                PermissionPolicy::Supervised
            },
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
