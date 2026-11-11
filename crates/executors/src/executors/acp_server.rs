use std::{collections::HashMap, path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        acp::{
            AcpAgentHarnessV2,
            discovery::{self, DiscoverySpec},
            registry,
            registry::{npx_command, registry_key},
            session_config::DesiredConfig,
        },
    },
    model_selector::PermissionPolicy,
    profile::ExecutorConfig,
};

/// An agent installed from the ACP registry
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct AcpServer {
    #[schemars(
        title = "Registry ID",
        description = "ID of the agent in the ACP registry",
        extend("readOnly" = true)
    )]
    pub registry_id: String,
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    /// Model, reasoning, mode and permission selected for this run.
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(PartialEq = "ignore")]
    pub config: DesiredConfig,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

#[async_trait]
impl StandardCodingAgentExecutor for AcpServer {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        let mut harness = AcpAgentHarnessV2::new().with_config(self.config.clone());
        harness.apply_overrides(executor_config);
        self.config = harness.config().clone();
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (combined_prompt, command, env) = self.build_spawn_args(prompt, env).await?;

        let command = command.build_initial()?;

        AcpAgentHarnessV2::new()
            .with_discovery_key(discovery::cache_key(
                &registry_key(&self.registry_id),
                &self.key_input(),
            ))
            .with_config(self.desired_config())
            .spawn_with_command(
                current_dir,
                combined_prompt,
                command,
                &env,
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
        let (combined_prompt, command, env) = self.build_spawn_args(prompt, env).await?;

        let command = command.build_follow_up(&[])?;

        AcpAgentHarnessV2::new()
            .with_discovery_key(discovery::cache_key(
                &registry_key(&self.registry_id),
                &self.key_input(),
            ))
            .with_config(self.desired_config())
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                command,
                &env,
                &self.cmd,
                self.approvals.clone(),
            )
            .await
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        None
    }

    /// Installed means present in profiles: npx downloads the agent on first run
    fn get_availability_info(&self) -> AvailabilityInfo {
        AvailabilityInfo::InstallationFound
    }

    /// Ask by default: tool requests go to the user unless Auto is picked.
    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            permission_policy: Some(PermissionPolicy::Supervised),
            ..ExecutorConfig::new(registry_key(&self.registry_id))
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&Path>,
        _repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        Ok(discovery::discover(self.discovery_spec().await?))
    }

    /// Needs only the cache key, so it reads neither the registry nor the network.
    async fn warm_options_cache(&self) {
        discovery::warm(discovery::cache_key(
            &registry_key(&self.registry_id),
            &self.key_input(),
        ))
        .await;
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<JoinHandle<()>> {
        super::acp::normalize_logs(msg_store, worktree_path)
    }

    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }
}

impl AcpServer {
    pub fn new(registry_id: impl Into<String>) -> Self {
        Self {
            registry_id: registry_id.into(),
            append_prompt: AppendPrompt::default(),
            config: DesiredConfig::default(),
            approvals: None,
            cmd: CmdOverrides::default(),
        }
    }

    /// Unset permission means Ask, matching the preset.
    fn desired_config(&self) -> DesiredConfig {
        DesiredConfig {
            permission: Some(
                self.config
                    .permission
                    .clone()
                    .unwrap_or(PermissionPolicy::Supervised),
            ),
            ..self.config.clone()
        }
    }

    /// The registry command with user overrides, and the agent's distribution env.
    async fn command_and_env(
        &self,
    ) -> Result<(CommandBuilder, HashMap<String, String>), ExecutorError> {
        let agent = registry::cached()
            .await?
            .into_iter()
            .find(|a| a.id == self.registry_id)
            .ok_or_else(|| ExecutorError::AcpRegistryAgentNotFound(self.registry_id.clone()))?;
        let npx = agent
            .distribution
            .npx
            .ok_or(ExecutorError::AcpRegistryAgentNotFound(
                self.registry_id.clone(),
            ))?;
        let command = apply_overrides(npx_command(&self.registry_id, &npx)?, &self.cmd)?;
        Ok((command, npx.env))
    }

    async fn build_spawn_args(
        &self,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<(String, CommandBuilder, ExecutionEnv), ExecutorError> {
        let (command, npx_env) = self.command_and_env().await?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        tracing::info!(registry_id = %self.registry_id, base = %command.base, params = ?command.params, "Spawning ACP registry agent");
        let env = env.clone().with_overrides(&npx_env);

        Ok((combined_prompt, command, env))
    }

    /// Starts nothing, but reads the registry, which is fetched if there's no copy on disk.
    async fn discovery_spec(&self) -> Result<DiscoverySpec, ExecutorError> {
        let (command, mut env) = self.command_and_env().await?;
        if let Some(profile_env) = &self.cmd.env {
            env.extend(profile_env.clone());
        }
        Ok(DiscoverySpec {
            base_executor: registry_key(&self.registry_id),
            key_input: self.key_input(),
            command,
            env,
            prepare: None,
            fallback: None,
        })
    }

    /// The registry id and the user's overrides, not the registry command: its package is
    /// versioned, and a registry update must still find the older list.
    fn key_input(&self) -> serde_json::Value {
        let env: std::collections::BTreeMap<_, _> = self.cmd.env.iter().flatten().collect();
        serde_json::json!({
            "registry_id": self.registry_id,
            "base_command_override": self.cmd.base_command_override,
            "additional_params": self.cmd.additional_params,
            "env": env,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::acp::registry::NpxDistribution;

    fn kilo() -> NpxDistribution {
        NpxDistribution {
            package: "@kilocode/cli@7.8.18".to_string(),
            args: vec!["acp".to_string()],
            env: Default::default(),
        }
    }

    #[test]
    fn base_command_override_replaces_npx_and_package() {
        let overrides = CmdOverrides {
            base_command_override: Some("kilo".to_string()),
            ..Default::default()
        };
        let command = apply_overrides(npx_command("kilo", &kilo()).unwrap(), &overrides).unwrap();
        // `kilo acp`, not `kilo @kilocode/cli@7.8.18 acp`
        assert_eq!(command.base, "kilo");
        assert_eq!(command.params, Some(vec!["acp".to_string()]));
    }

    #[test]
    fn cache_key_ignores_the_package_version() {
        let agent = AcpServer::new("kilo");
        // Built without the registry entry, so a new package version can't change it
        let key = discovery::cache_key(&registry_key("kilo"), &agent.key_input());
        assert_eq!(
            key,
            discovery::cache_key(&registry_key("kilo"), &AcpServer::new("kilo").key_input())
        );
        let mut overridden = AcpServer::new("kilo");
        overridden.cmd.base_command_override = Some("kilo".to_string());
        assert_ne!(
            key,
            discovery::cache_key(&registry_key("kilo"), &overridden.key_input())
        );
    }
}
