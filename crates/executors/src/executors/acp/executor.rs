use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, shell::resolve_executable_path_blocking};

use super::AcpAgentHarness;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    profile::ExecutorConfig,
};

const SESSION_NAMESPACE: &str = "acp_sessions";

fn default_acp_command() -> String {
    "omp".to_string()
}

fn default_acp_args() -> Vec<String> {
    vec!["acp".to_string()]
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Acp {
    #[serde(default = "default_acp_command")]
    pub command: String,
    #[serde(default = "default_acp_args")]
    pub args: Vec<String>,
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
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

    fn harness(&self) -> AcpAgentHarness {
        let mut harness = AcpAgentHarness::new(SESSION_NAMESPACE);
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }
        if let Some(mode) = &self.mode {
            harness = harness.with_mode(mode);
        }
        harness
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Acp {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
        if let Some(agent_id) = &executor_config.agent_id {
            self.mode = Some(agent_id.clone());
        }
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = self.harness();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let command = self.build_command_builder()?.build_initial()?;
        harness
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
        let harness = self.harness();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let command = self.build_command_builder()?.build_follow_up(&[])?;
        harness
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
    ) -> Vec<tokio::task::JoinHandle<()>> {
        super::normalize_logs_with_suppressed_stderr_patterns(msg_store, worktree_path, &[])
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

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::Acp,
            variant: None,
            model_id: self.model.clone(),
            agent_id: self.mode.clone(),
            reasoning_id: None,
            permission_policy: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::CodingAgent;

    fn test_acp() -> Acp {
        Acp {
            command: "omp".to_string(),
            args: vec!["acp".to_string()],
            append_prompt: AppendPrompt::default(),
            model: None,
            mode: None,
            cmd: CmdOverrides::default(),
            approvals: None,
        }
    }

    #[test]
    fn default_acp_deserializes_from_empty_object() {
        let acp: Acp = serde_json::from_str("{}").unwrap();
        assert_eq!(acp.command, "omp");
        assert_eq!(acp.args, vec!["acp".to_string()]);
    }

    #[test]
    fn variant_tag_is_acp() {
        assert_eq!(
            serde_json::to_string(&BaseCodingAgent::Acp).unwrap(),
            r#""ACP""#
        );
        let parsed: BaseCodingAgent = serde_json::from_str(r#""ACP""#).unwrap();
        assert_eq!(parsed, BaseCodingAgent::Acp);

        let value = serde_json::to_value(CodingAgent::Acp(test_acp())).unwrap();
        assert!(
            value.get("ACP").is_some(),
            "externally tagged variant key should be ACP, got {value}"
        );
        let round_tripped: CodingAgent = serde_json::from_value(value).unwrap();
        assert_eq!(round_tripped, CodingAgent::Acp(test_acp()));
    }

    #[test]
    fn command_and_args_feed_command_builder() {
        let acp = test_acp();
        let builder = acp.build_command_builder().unwrap();
        assert_eq!(builder.base, "omp");
        assert_eq!(builder.params, Some(vec!["acp".to_string()]));
        // CommandParts fields are private; assert the public parse path succeeds.
        let _parts = builder.build_initial().unwrap();

        let override_acp = Acp {
            cmd: CmdOverrides {
                base_command_override: Some("omp-other --flag".to_string()),
                ..Default::default()
            },
            ..test_acp()
        };
        let overridden = override_acp.build_command_builder().unwrap();
        assert_eq!(overridden.base, "omp-other --flag");
    }

    #[test]
    fn overrides_persist_on_profile_and_preset() {
        let mut acp = test_acp();
        acp.apply_overrides(&ExecutorConfig {
            executor: BaseCodingAgent::Acp,
            variant: None,
            model_id: Some("m1".to_string()),
            agent_id: Some("plan".to_string()),
            reasoning_id: None,
            permission_policy: None,
        });
        assert_eq!(acp.model.as_deref(), Some("m1"));
        assert_eq!(acp.mode.as_deref(), Some("plan"));
        let preset = acp.get_preset_options();
        assert_eq!(preset.model_id.as_deref(), Some("m1"));
        assert_eq!(preset.agent_id.as_deref(), Some("plan"));
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
}
