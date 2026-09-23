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
}

#[async_trait]
impl StandardCodingAgentExecutor for Acp {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        // Acp has no model/mode fields to map; harness consumes what it supports.
        let mut harness = AcpAgentHarness::with_session_namespace(SESSION_NAMESPACE);
        harness.apply_overrides(executor_config);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarness::with_session_namespace(SESSION_NAMESPACE);
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
        let harness = AcpAgentHarness::with_session_namespace(SESSION_NAMESPACE);
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
        if resolve_executable_path_blocking(&self.command).is_some() {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::Acp,
            variant: None,
            model_id: None,
            agent_id: None,
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
}
