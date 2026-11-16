use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, shell::resolve_executable_path_blocking};

use super::{
    AcpAgentHarnessV2,
    discovery::{self, DiscoverySpec},
    session_config::DesiredConfig,
};
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    model_selector::PermissionPolicy,
    profile::ExecutorConfig,
};

fn default_acp_command() -> String {
    "omp".to_string()
}

fn default_acp_args() -> Vec<String> {
    vec!["acp".to_string()]
}

/// Any ACP agent CLI that is on PATH, started with a configured command.
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Acp {
    #[serde(default = "default_acp_command")]
    pub command: String,
    #[serde(default = "default_acp_args")]
    pub args: Vec<String>,
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

impl Acp {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder =
            CommandBuilder::new(self.command.clone()).extend_params(self.args.iter().cloned());
        apply_overrides(builder, &self.cmd)
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

    /// Side-effect free: also computes the cache key on every selector open.
    fn discovery_spec(&self) -> Result<DiscoverySpec, ExecutorError> {
        let command = self.build_command_builder()?;
        let env = self.cmd.env.clone().unwrap_or_default();
        Ok(DiscoverySpec {
            base_executor: BaseCodingAgent::acp(),
            key_input: discovery::command_key_input(&command, &env),
            command,
            env,
            prepare: None,
            fallback: None,
        })
    }

    fn harness(&self) -> AcpAgentHarnessV2 {
        let harness = AcpAgentHarnessV2::new().with_config(self.desired_config());
        match self.discovery_spec() {
            Ok(spec) => harness.with_discovery_key(spec.cache_key()),
            Err(_) => harness,
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Acp {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

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
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let command = self.build_command_builder()?.build_initial()?;
        self.harness()
            .spawn_with_command(
                current_dir,
                combined_prompt,
                command,
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
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let command = self.build_command_builder()?.build_follow_up(&[])?;
        self.harness()
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                command,
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
    ) -> Vec<JoinHandle<()>> {
        super::normalize_logs(msg_store, worktree_path)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        None
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Resolve the program spawn would run, so base_command_override is honored.
        let found = self
            .build_command_builder()
            .and_then(|b| b.build_initial())
            .is_ok_and(|parts| resolve_executable_path_blocking(parts.program()).is_some());
        if found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    /// Ask by default: tool requests go to the user unless Auto is picked.
    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            permission_policy: Some(PermissionPolicy::Supervised),
            ..ExecutorConfig::new(BaseCodingAgent::acp())
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&Path>,
        _repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        Ok(discovery::discover(self.discovery_spec()?))
    }

    async fn warm_options_cache(&self) {
        if let Ok(spec) = self.discovery_spec() {
            discovery::warm(spec.cache_key()).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::CodingAgent;

    fn test_acp() -> Acp {
        serde_json::from_str("{}").unwrap()
    }

    #[test]
    fn default_acp_deserializes_from_empty_object() {
        let acp = test_acp();
        assert_eq!(acp.command, "omp");
        assert_eq!(acp.args, vec!["acp".to_string()]);
    }

    #[test]
    fn variant_tag_is_acp() {
        let value = serde_json::to_value(CodingAgent::Acp(test_acp())).unwrap();
        assert!(
            value.get("ACP").is_some(),
            "externally tagged variant key should be ACP, got {value}"
        );
        let round_tripped: CodingAgent = serde_json::from_value(value).unwrap();
        assert_eq!(round_tripped, CodingAgent::Acp(test_acp()));
        assert_eq!(
            BaseCodingAgent::from(&CodingAgent::Acp(test_acp())),
            BaseCodingAgent::acp()
        );
    }

    #[test]
    fn command_and_args_feed_command_builder() {
        let builder = test_acp().build_command_builder().unwrap();
        assert_eq!(builder.base, "omp");
        assert_eq!(builder.params, Some(vec!["acp".to_string()]));

        let override_acp = Acp {
            cmd: CmdOverrides {
                base_command_override: Some("omp-other --flag".to_string()),
                ..Default::default()
            },
            ..test_acp()
        };
        let parts = override_acp
            .build_command_builder()
            .unwrap()
            .build_initial()
            .unwrap();
        assert_eq!(parts.program(), "omp-other");
    }

    #[test]
    fn overrides_reach_the_harness_config() {
        let mut acp = test_acp();
        acp.apply_overrides(&ExecutorConfig {
            model_id: Some("m1".to_string()),
            agent_id: Some("plan".to_string()),
            ..ExecutorConfig::new(BaseCodingAgent::acp())
        });
        let config = acp.desired_config();
        assert_eq!(config.model.as_deref(), Some("m1"));
        assert_eq!(config.mode.as_deref(), Some("plan"));
        assert_eq!(config.permission, Some(PermissionPolicy::Supervised));
    }

    #[test]
    fn availability_uses_base_command_override() {
        let missing = Acp {
            command: "definitely-not-a-real-binary-xyz".to_string(),
            ..test_acp()
        };
        assert!(matches!(
            missing.get_availability_info(),
            AvailabilityInfo::NotFound
        ));
        // `cargo` exists wherever these tests run.
        let overridden = Acp {
            cmd: CmdOverrides {
                base_command_override: Some("cargo --version".to_string()),
                ..Default::default()
            },
            ..missing
        };
        assert!(matches!(
            overridden.get_availability_info(),
            AvailabilityInfo::InstallationFound
        ));
    }

    #[test]
    fn cache_key_follows_the_command() {
        let key = test_acp().discovery_spec().unwrap().cache_key();
        assert_eq!(key, test_acp().discovery_spec().unwrap().cache_key());
        let other = Acp {
            command: "other-agent".to_string(),
            ..test_acp()
        };
        assert_ne!(key, other.discovery_spec().unwrap().cache_key());
    }
}
