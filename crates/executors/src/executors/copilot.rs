use std::{collections::HashMap, path::Path, process::Stdio, sync::Arc, time::Duration};

use async_trait::async_trait;
use derivative::Derivative;
use futures::future::BoxFuture;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use ts_rs::TS;
use workspace_utils::{command_ext::GroupSpawnNoWindowExt, msg_store::MsgStore};

use super::acp::{
    AcpAgentHarnessV2,
    discovery::{self, DiscoverySpec},
    registry::{self, NpxDistribution, npx_command},
    session_config::DesiredConfig,
};
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executor_discovery::ExecutorDiscoveredOptions,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    model_selector::{ModelInfo, ModelSelectorConfig, PermissionPolicy},
    profile::ExecutorConfig,
};

/// Copilot's entry in the ACP registry, which gives the package and args to run.
const REGISTRY_ID: &str = "github-copilot-cli";

/// Used only when there's no registry copy in memory or on disk. Unversioned on purpose, so
/// there's no pin to bump: npx then asks npm for the latest launcher on each run. The registry's
/// exact version is what lets npx run from its cache with no request (the CLI then updates itself).
const FALLBACK_PACKAGE: &str = "@github/copilot";

/// Limit for `copilot mcp list --json` before a discovery.
const MCP_LIST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Copilot {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_all_tools: Option<bool>,
    /// Start in plan mode. Takes precedence over `allow_all_tools`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deny_tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub add_dir: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_mcp_server: Option<Vec<String>>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    /// Mode selected through `agent_id` for this run.
    #[serde(skip)]
    #[ts(skip)]
    pub agent_mode: Option<String>,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Copilot {
    /// Plan wins over allow-all (same as Claude), otherwise allow-all means Auto.
    pub fn permission_policy(&self) -> PermissionPolicy {
        if self.plan.unwrap_or(false) {
            PermissionPolicy::Plan
        } else if self.allow_all_tools.unwrap_or(false) {
            PermissionPolicy::Auto
        } else {
            PermissionPolicy::Supervised
        }
    }

    /// The registry command, or the fallback when an override replaces the base anyway.
    async fn base_command(&self) -> CommandBuilder {
        if self.cmd.base_command_override.is_some() {
            command_from(None)
        } else {
            registry_command(REGISTRY_ID).await
        }
    }

    /// `copilot login --device-code` from the same package a run uses, for the Sign in button.
    /// The device flow prints a code and link (no browser needed), and runs without a TTY.
    pub async fn login_command(&self) -> CommandBuilder {
        self.login_command_from(self.base_command().await)
    }

    /// Replaces the run args (`--acp`) and ignores `additional_params`, which are run flags
    /// `login` would reject. Only the base override applies.
    fn login_command_from(&self, base: CommandBuilder) -> CommandBuilder {
        let base = match &self.cmd.base_command_override {
            Some(override_base) => override_base.clone(),
            None => base.base,
        };
        CommandBuilder::new(base).params(["login", "--device-code"])
    }

    /// `base` already carries the registry args (`--acp`).
    fn build_command_builder(
        &self,
        base: CommandBuilder,
    ) -> Result<CommandBuilder, CommandBuildError> {
        // Model and permissions are set over ACP after the session opens (`desired_config`),
        // so a model Copilot no longer offers is skipped with a warning instead of failing
        let mut builder = base;

        if let Some(tool) = &self.allow_tool {
            builder = builder.extend_params(["--allow-tool", tool]);
        }

        if let Some(tool) = &self.deny_tool {
            builder = builder.extend_params(["--deny-tool", tool]);
        }

        if let Some(dirs) = &self.add_dir {
            for dir in dirs {
                builder = builder.extend_params(["--add-dir", dir]);
            }
        }

        if let Some(servers) = &self.disable_mcp_server {
            for server in servers {
                builder = builder.extend_params(["--disable-mcp-server", server]);
            }
        }

        apply_overrides(builder, &self.cmd)
    }

    /// Model, reasoning, mode and permissions applied over ACP after the session starts.
    fn desired_config(&self) -> DesiredConfig {
        if self.plan.unwrap_or(false) && self.allow_all_tools.unwrap_or(false) {
            tracing::warn!("Both plan and allow_all_tools are enabled. Plan will take precedence.");
        }
        let permission = self.permission_policy();
        let allow_all = if permission == PermissionPolicy::Auto {
            "on"
        } else {
            "off"
        };
        DesiredConfig {
            model: self.model.clone(),
            reasoning: self.reasoning_effort.clone(),
            mode: self.agent_mode.clone(),
            permission: Some(permission),
            extra: vec![("allow_all".to_string(), allow_all.to_string())],
        }
    }

    /// Built from the unversioned fallback, not `base_command()`: the key ignores the registry
    /// version on purpose, so a new Copilot release still finds the cached list.
    fn key_input(&self) -> Result<serde_json::Value, ExecutorError> {
        let command = apply_overrides(command_from(None), &self.cmd)?;
        let env = self.cmd.env.clone().unwrap_or_default();
        Ok(discovery::command_key_input(&command, &env))
    }

    /// Base command and user overrides only: no run flags, and no side effects.
    async fn discovery_spec(&self) -> Result<DiscoverySpec, ExecutorError> {
        let command = apply_overrides(self.base_command().await, &self.cmd)?;
        let env = self.cmd.env.clone().unwrap_or_default();
        Ok(DiscoverySpec {
            base_executor: BaseCodingAgent::copilot(),
            key_input: self.key_input()?,
            command,
            env,
            prepare: Some(prepare_discovery),
            fallback: Some(fallback_options()),
        })
    }
}

/// The registry's package and args, else `npx -y @github/copilot --acp`.
fn command_from(npx: Option<&NpxDistribution>) -> CommandBuilder {
    if let Some(npx) = npx {
        match npx_command(REGISTRY_ID, npx) {
            Ok(command) => return command,
            Err(e) => tracing::warn!("{e}; using {FALLBACK_PACKAGE}"),
        }
    }
    CommandBuilder::new(format!("npx -y {FALLBACK_PACKAGE}")).extend_params(["--acp"])
}

/// The command for registry agent `id` from the cached registry (never fetched here).
async fn registry_command(id: &str) -> CommandBuilder {
    command_from(registry::find_npx(id).await.as_ref())
}

/// Stops the user's MCP servers from starting during discovery (Copilot starts them on
/// `session/new`). Lists them with `copilot mcp list --json` from the same base command, which
/// covers user, workspace, plugin and built-in servers and follows `COPILOT_HOME`.
fn prepare_discovery(
    command: CommandBuilder,
    env: HashMap<String, String>,
) -> BoxFuture<'static, CommandBuilder> {
    Box::pin(async move {
        let servers = list_mcp_servers(&command.base, &env)
            .await
            .inspect_err(|e| {
                tracing::debug!("copilot mcp list failed, disabling built-in servers only: {e}")
            })
            .unwrap_or_default();
        disable_mcp_servers(command, &servers)
    })
}

fn disable_mcp_servers(command: CommandBuilder, servers: &[String]) -> CommandBuilder {
    let mut command = command.extend_params(["--disable-builtin-mcps"]);
    for server in servers {
        command = command.extend_params(["--disable-mcp-server", server]);
    }
    command
}

async fn list_mcp_servers(
    base: &str,
    env: &HashMap<String, String>,
) -> Result<Vec<String>, String> {
    let (program, args) = CommandBuilder::new(base)
        .params(["mcp", "list", "--json"])
        .build_initial()
        .map_err(|e| e.to_string())?
        .into_resolved()
        .await
        .map_err(|e| e.to_string())?;
    let mut command = tokio::process::Command::new(program);
    command
        .args(args)
        .envs(env)
        .current_dir(std::env::temp_dir())
        .env("NPM_CONFIG_LOGLEVEL", "error")
        .env("NODE_NO_WARNINGS", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    // Its own process group, so a timeout also stops the Copilot process npx started.
    let mut child = command.group_spawn_no_window().map_err(|e| e.to_string())?;
    let mut stdout = child.inner().stdout.take().ok_or("no stdout")?;
    let finished = tokio::time::timeout(MCP_LIST_TIMEOUT, async {
        let mut output = Vec::new();
        stdout
            .read_to_end(&mut output)
            .await
            .map_err(|e| e.to_string())?;
        let status = child.wait().await.map_err(|e| e.to_string())?;
        Ok::<_, String>((status, output))
    })
    .await;
    let Ok(result) = finished else {
        let _ = child.kill().await;
        return Err("timed out".to_string());
    };
    let (status, output) = result?;
    if !status.success() {
        return Err(format!("exited with {status}"));
    }
    parse_mcp_list(&output)
}

fn parse_mcp_list(stdout: &[u8]) -> Result<Vec<String>, String> {
    let value: serde_json::Value = serde_json::from_slice(stdout).map_err(|e| e.to_string())?;
    let servers = value
        .get("mcpServers")
        .and_then(|s| s.as_object())
        .ok_or("no mcpServers object")?;
    Ok(servers.keys().cloned().collect())
}

/// Shown only when discovery fails and nothing is cached.
fn fallback_options() -> ExecutorDiscoveredOptions {
    ExecutorDiscoveredOptions {
        model_selector: ModelSelectorConfig {
            models: [
                ("auto", "Auto"),
                ("claude-sonnet-5.5", "Claude Sonnet 5.5"),
                ("claude-haiku-4.5", "Claude Haiku 4.5"),
                ("gpt-5.3-codex", "GPT-5.3-Codex"),
            ]
            .into_iter()
            .map(|(id, name)| ModelInfo {
                id: id.to_string(),
                name: name.to_string(),
                provider_id: None,
                reasoning_options: vec![],
            })
            .collect(),
            permissions: vec![
                PermissionPolicy::Auto,
                PermissionPolicy::Supervised,
                PermissionPolicy::Plan,
            ],
            ..Default::default()
        },
        models_complete: false,
        ..Default::default()
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Copilot {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }

        if let Some(reasoning_id) = &executor_config.reasoning_id {
            self.reasoning_effort = Some(reasoning_id.clone());
        }

        if let Some(agent_id) = &executor_config.agent_id {
            self.agent_mode = Some(agent_id.clone());
        }

        if let Some(permission_policy) = &executor_config.permission_policy {
            self.plan = Some(matches!(permission_policy, PermissionPolicy::Plan));
            self.allow_all_tools = Some(matches!(permission_policy, PermissionPolicy::Auto));
        }
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarnessV2::new().with_config(self.desired_config());
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let copilot_command = self
            .build_command_builder(self.base_command().await)?
            .build_initial()?;
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                copilot_command,
                env,
                &self.cmd,
                self.approvals.clone(),
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
        let harness = AcpAgentHarnessV2::new()
            .with_legacy_sessions("copilot_sessions")
            .with_config(self.desired_config());
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let copilot_command = self
            .build_command_builder(self.base_command().await)?
            .build_follow_up(&[])?;
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                copilot_command,
                env,
                &self.cmd,
                self.approvals.clone(),
            )
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        super::acp::normalize_logs(msg_store, worktree_path)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".copilot").join("mcp-config.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".copilot").join("config.json").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::copilot(),
            variant: None,
            model_id: self.model.clone(),
            agent_id: None,
            reasoning_id: self.reasoning_effort.clone(),
            permission_policy: Some(self.permission_policy()),
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&std::path::Path>,
        _repo_path: Option<&std::path::Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        Ok(discovery::discover(self.discovery_spec().await?))
    }

    async fn warm_options_cache(&self) {
        if let Ok(key_input) = self.key_input() {
            discovery::warm(discovery::cache_key(
                &BaseCodingAgent::copilot(),
                &key_input,
            ))
            .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn copilot() -> Copilot {
        serde_json::from_value(serde_json::json!({})).unwrap()
    }

    #[test]
    fn plan_wins_over_allow_all() {
        let mut c = copilot();
        c.allow_all_tools = Some(true);
        assert_eq!(c.permission_policy(), PermissionPolicy::Auto);
        c.plan = Some(true);
        assert_eq!(c.permission_policy(), PermissionPolicy::Plan);
        assert_eq!(
            c.get_preset_options().permission_policy,
            Some(PermissionPolicy::Plan)
        );
        let desired = c.desired_config();
        assert_eq!(desired.permission, Some(PermissionPolicy::Plan));
        assert_eq!(desired.extra, vec![("allow_all".into(), "off".into())]);
        assert!(!desired.auto_approve());
    }

    fn registry_entry() -> NpxDistribution {
        NpxDistribution {
            package: "@github/copilot@1.0.108".into(),
            args: vec!["--acp".into()],
            env: Default::default(),
        }
    }

    #[test]
    fn command_from_registry_entry() {
        let command = command_from(Some(&registry_entry()));
        assert_eq!(command.base, "npx -y @github/copilot@1.0.108");
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn command_falls_back_without_registry() {
        let command = command_from(None);
        assert_eq!(command.base, "npx -y @github/copilot");
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn invalid_registry_package_falls_back() {
        let npx = NpxDistribution {
            package: "@github/copilot --evil".into(),
            ..registry_entry()
        };
        assert_eq!(command_from(Some(&npx)).base, "npx -y @github/copilot");
    }

    /// Model and permissions go over ACP only, never as CLI flags.
    #[test]
    fn run_command_has_no_model_or_allow_all_flags() {
        let mut c = copilot();
        c.model = Some("gpt-5.4".into());
        c.allow_all_tools = Some(true);
        c.allow_tool = Some("shell".into());
        assert_eq!(c.permission_policy(), PermissionPolicy::Auto);
        let command = c
            .build_command_builder(command_from(Some(&registry_entry())))
            .unwrap();
        assert_eq!(command.base, "npx -y @github/copilot@1.0.108");
        let params = command.params.unwrap_or_default();
        assert!(
            !params
                .iter()
                .any(|p| p == "--model" || p == "--allow-all-tools")
        );
        assert_eq!(params.iter().filter(|p| *p == "--acp").count(), 1);
        assert!(params.windows(2).any(|w| w == ["--allow-tool", "shell"]));
    }

    #[test]
    fn base_command_override_keeps_acp() {
        let mut c = copilot();
        c.cmd.base_command_override = Some("my-copilot-wrapper".into());
        let command = c.build_command_builder(command_from(None)).unwrap();
        assert_eq!(command.base, "my-copilot-wrapper");
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn login_command_uses_registry_package_without_run_args() {
        let mut c = copilot();
        c.cmd.additional_params = Some(vec!["--allow-all-tools".into()]);
        let command = c.login_command_from(command_from(Some(&registry_entry())));
        assert_eq!(command.base, "npx -y @github/copilot@1.0.108");
        assert_eq!(
            command.params,
            Some(vec!["login".to_string(), "--device-code".to_string()])
        );
    }

    #[test]
    fn login_command_keeps_base_override() {
        let mut c = copilot();
        c.cmd.base_command_override = Some("my-copilot-wrapper".into());
        let command = c.login_command_from(command_from(None));
        assert_eq!(command.base, "my-copilot-wrapper");
        assert_eq!(
            command.params,
            Some(vec!["login".to_string(), "--device-code".to_string()])
        );
    }

    #[test]
    fn no_flags_means_ask() {
        assert_eq!(copilot().permission_policy(), PermissionPolicy::Supervised);
    }

    #[test]
    fn overrides_map_to_config() {
        let mut c = copilot();
        c.apply_overrides(&ExecutorConfig {
            executor: BaseCodingAgent::copilot(),
            variant: None,
            model_id: Some("kimi-k3".into()),
            agent_id: Some("autopilot".into()),
            reasoning_id: Some("high".into()),
            permission_policy: Some(PermissionPolicy::Auto),
        });
        let desired = c.desired_config();
        assert_eq!(desired.model.as_deref(), Some("kimi-k3"));
        assert_eq!(desired.reasoning.as_deref(), Some("high"));
        assert_eq!(desired.mode.as_deref(), Some("autopilot"));
        assert!(desired.auto_approve());
        assert_eq!(desired.extra, vec![("allow_all".into(), "on".into())]);
    }

    #[test]
    fn cache_key_ignores_run_settings_and_registry_version() {
        let mut c = copilot();
        c.model = Some("gpt-5.4".into());
        c.allow_all_tools = Some(true);
        // Built from the unversioned fallback, never from the registry entry
        assert_eq!(
            c.key_input().unwrap(),
            discovery::command_key_input(&command_from(None), &HashMap::new())
        );
        assert_eq!(c.key_input().unwrap(), copilot().key_input().unwrap());
    }

    #[test]
    fn cache_key_follows_base_override() {
        let mut c = copilot();
        c.cmd.base_command_override = Some("my-copilot-wrapper".into());
        assert_ne!(c.key_input().unwrap(), copilot().key_input().unwrap());
    }

    #[tokio::test]
    async fn discovery_command_keeps_base_override() {
        let mut c = copilot();
        c.cmd.base_command_override = Some("my-copilot-wrapper".into());
        let spec = c.discovery_spec().await.unwrap();
        assert_eq!(spec.command.base, "my-copilot-wrapper");
        assert_eq!(spec.command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn mcp_servers_are_disabled_for_discovery() {
        let names = parse_mcp_list(
            br#"{"mcpServers":{"computer-use":{"source":"builtin"},"mine":{"type":"stdio"}}}"#,
        )
        .unwrap();
        let command = disable_mcp_servers(CommandBuilder::new("copilot"), &names);
        let params = command.params.unwrap();
        assert_eq!(params[0], "--disable-builtin-mcps");
        assert!(
            params
                .windows(2)
                .any(|w| w == ["--disable-mcp-server", "mine"])
        );
        assert!(
            params
                .windows(2)
                .any(|w| w == ["--disable-mcp-server", "computer-use"])
        );
        assert!(parse_mcp_list(b"not json").is_err());
        assert!(parse_mcp_list(b"{}").is_err());
    }

    /// Runs discovery against the real Copilot CLI (needs `copilot login`; sends no prompts).
    /// `cargo test -p executors live_copilot_discovery -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "starts the real Copilot CLI"]
    async fn live_copilot_discovery() {
        use futures::StreamExt;

        let started = std::time::Instant::now();
        let stream = copilot().discover_options(None, None).await.unwrap();
        let patches: Vec<_> = stream.collect().await;
        let mut doc = serde_json::json!({ "options": null });
        for p in &patches {
            json_patch::patch(&mut doc, p).unwrap();
        }
        let options: ExecutorDiscoveredOptions =
            serde_json::from_value(doc["options"].clone()).unwrap();
        println!(
            "{} patches in {:?}; error={:?}; complete={}; permissions={:?}",
            patches.len(),
            started.elapsed(),
            options.error,
            options.models_complete,
            options.model_selector.permissions
        );
        for m in &options.model_selector.models {
            let reasoning: Vec<_> = m
                .reasoning_options
                .iter()
                .map(|r| format!("{}{}", r.id, if r.is_default { "*" } else { "" }))
                .collect();
            println!("  {:22} {:22} {:?}", m.id, m.name, reasoning);
        }
        assert!(options.error.is_none());
        assert!(options.models_complete);
        assert!(!options.loading_models && !options.loading_agents);
        assert!(!options.loading_slash_commands);
        assert!(
            options
                .model_selector
                .permissions
                .contains(&PermissionPolicy::Plan)
        );
        assert_eq!(options.model_selector.models[0].id, "auto");
    }

    /// Applies a config over a real Copilot connection, without sending a prompt.
    /// `cargo test -p executors live_copilot_config -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "starts the real Copilot CLI"]
    async fn live_copilot_config() {
        let (line, warnings) = live_apply("kimi-k3", "max", PermissionPolicy::Plan).await;
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(
            line.as_deref(),
            Some("Model: Kimi K3 · Reasoning: Max · Mode: Plan · Permissions: Plan")
        );
    }

    /// Auto sets `allow_all` after reasoning, which must not undo it
    #[tokio::test]
    #[ignore = "starts the real Copilot CLI"]
    async fn live_copilot_config_auto() {
        let (line, warnings) = live_apply("claude-haiku-5.5", "high", PermissionPolicy::Auto).await;
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(
            line.as_deref(),
            Some("Model: Claude Haiku 5.5 · Reasoning: High · Mode: Agent · Permissions: Auto")
        );
    }

    async fn live_apply(
        model: &str,
        reasoning: &str,
        permission: PermissionPolicy,
    ) -> (Option<String>, Vec<String>) {
        use acp::{Agent, ConnectionTo};

        use crate::executors::acp::{
            harness_v2::{
                ConnectionSink, initialize, open_session, spawn_acp_process, take_transport,
            },
            session_config::{apply_config, summary},
        };

        let dir = tempfile::TempDir::new().unwrap();
        let mut c = copilot();
        c.apply_overrides(&ExecutorConfig {
            executor: BaseCodingAgent::copilot(),
            variant: None,
            model_id: Some(model.into()),
            agent_id: None,
            reasoning_id: Some(reasoning.into()),
            permission_policy: Some(permission),
        });
        let desired = c.desired_config();
        let spec = c.discovery_spec().await.unwrap();
        let command = disable_mcp_servers(spec.command, &[]);
        let mut child = spawn_acp_process(dir.path(), command.build_initial().unwrap(), &spec.env)
            .await
            .unwrap();
        let transport = take_transport(&mut child).unwrap();
        let cwd = dir.path().to_path_buf();
        let (line, warnings) = acp::Client
            .builder()
            .connect_with(transport, async move |connection: ConnectionTo<Agent>| {
                initialize(&connection).await?;
                let (session_id, mut options) = open_session(&connection, None, cwd).await?;
                let mut sink = ConnectionSink {
                    connection: &connection,
                    session_id,
                };
                let outcome = apply_config(&mut options, &desired, &mut sink).await;
                Ok((
                    summary(&options, outcome.permission.as_ref()),
                    outcome.warnings,
                ))
            })
            .await
            .unwrap();
        let _ = child.kill().await;
        println!("{line:?} {warnings:?}");
        (line, warnings)
    }
}
