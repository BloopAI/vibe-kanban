use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorSessionOverrides, SpawnedChild,
        StandardCodingAgentExecutor, gemini::AcpAgentHarness,
    },
    logs::utils::patch,
};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct QwenCode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mode")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl QwenCode {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y @qwen-code/qwen-code@0.9.1");

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
        }
        builder = builder.extend_params(["--acp"]);
        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for QwenCode {
    fn apply_session_overrides(&mut self, overrides: &ExecutorSessionOverrides) {
        if let Some(model_id) = overrides.model_id.as_ref() {
            self.model = Some(model_id.clone());
        }

        if let Some(agent_id) = overrides.agent_id.as_ref() {
            self.agent = Some(agent_id.clone());
        }
        if let Some(permission_policy) = overrides.permission_policy.clone() {
            self.yolo = Some(matches!(
                permission_policy,
                crate::model_selector::PermissionPolicy::Auto
            ));
        }
    }

    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let qwen_command = self.build_command_builder()?.build_initial()?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mut harness = AcpAgentHarness::with_session_namespace("qwen_sessions");
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }
        if let Some(agent) = &self.agent {
            harness = harness.with_mode(agent);
        }
        let approvals = if self.yolo.unwrap_or(false) {
            None
        } else {
            self.approvals.clone()
        };
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                qwen_command,
                env,
                &self.cmd,
                approvals,
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
        let qwen_command = self.build_command_builder()?.build_follow_up(&[])?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mut harness = AcpAgentHarness::with_session_namespace("qwen_sessions");
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }
        if let Some(agent) = &self.agent {
            harness = harness.with_mode(agent);
        }
        let approvals = if self.yolo.unwrap_or(false) {
            None
        } else {
            self.approvals.clone()
        };
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                qwen_command,
                env,
                &self.cmd,
                approvals,
            )
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        crate::executors::acp::normalize_logs(msg_store, worktree_path);
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".qwen").join("settings.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".qwen").join("installation_id").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    async fn available_model_config(
        &self,
        _workdir: &Path,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let config = crate::model_selector::ModelSelectorConfig {
            permissions: vec![
                crate::model_selector::PermissionPolicy::Auto,
                crate::model_selector::PermissionPolicy::Supervised,
            ],
            ..Default::default()
        };
        Ok(Box::pin(futures::stream::once(async move {
            patch::model_selector_config(config, false, None)
        })))
    }

    fn get_preset_options(&self) -> crate::model_selector::PresetOptions {
        use crate::model_selector::*;
        PresetOptions {
            model_id: self.model.clone(),
            agent_id: self.agent.clone(),
            reasoning_id: None,
            permission_policy: if self.yolo.unwrap_or(false) {
                PermissionPolicy::Auto
            } else {
                PermissionPolicy::Supervised
            },
        }
    }
}
