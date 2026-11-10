use std::{path::Path, sync::Arc};

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
            AcpAgentHarnessV2, registry,
            registry::{NpxDistribution, registry_key},
        },
    },
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
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

#[async_trait]
impl StandardCodingAgentExecutor for AcpServer {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (combined_prompt, command, env) = self.build_spawn_args(prompt, env).await?;

        let command = command.build_initial()?;

        AcpAgentHarnessV2::new()
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

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig::new(registry_key(&self.registry_id))
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
            approvals: None,
            cmd: CmdOverrides::default(),
        }
    }

    async fn build_spawn_args(
        &self,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<(String, CommandBuilder, ExecutionEnv), ExecutorError> {
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

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let command = apply_overrides(npx_command(&self.registry_id, &npx)?, &self.cmd)?;
        tracing::info!(registry_id = %self.registry_id, base = %command.base, params = ?command.params, "Spawning ACP registry agent");
        let env = env.clone().with_overrides(&npx.env);

        Ok((combined_prompt, command, env))
    }
}

/// Puts the package in the base, like the built-in npx agents, so that a
/// `base_command_override` (which replaces only the base) swaps out the whole
/// `npx -y <package>` and keeps only the registry args.
fn npx_command(registry_id: &str, npx: &NpxDistribution) -> Result<CommandBuilder, ExecutorError> {
    // npm names can't contain whitespace; a broken registry entry must not
    // split into extra arguments when the base is parsed
    if npx.package.is_empty() || npx.package.chars().any(char::is_whitespace) {
        return Err(ExecutorError::InvalidAcpRegistryPackage {
            id: registry_id.to_string(),
            package: npx.package.clone(),
        });
    }
    Ok(CommandBuilder::new(format!("npx -y {}", npx.package)).extend_params(npx.args.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kilo() -> NpxDistribution {
        NpxDistribution {
            package: "@kilocode/cli@7.8.18".to_string(),
            args: vec!["acp".to_string()],
            env: Default::default(),
        }
    }

    #[test]
    fn package_is_part_of_the_base() {
        let command = npx_command("kilo", &kilo()).unwrap();
        assert_eq!(command.base, "npx -y @kilocode/cli@7.8.18");
        assert_eq!(command.params, Some(vec!["acp".to_string()]));
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
    fn rejects_package_with_whitespace() {
        for package in ["@kilocode/cli acp", "", "pkg\t--evil"] {
            let npx = NpxDistribution {
                package: package.to_string(),
                ..kilo()
            };
            assert!(matches!(
                npx_command("kilo", &npx),
                Err(ExecutorError::InvalidAcpRegistryPackage { .. })
            ));
        }
    }
}
