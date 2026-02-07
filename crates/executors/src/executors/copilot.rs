use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorSessionOverrides, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    logs::utils::patch,
};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Copilot {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_all_tools: Option<bool>,
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
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Copilot {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y @github/copilot@0.0.403");

        if self.allow_all_tools.unwrap_or(false) {
            builder = builder.extend_params(["--allow-all-tools"]);
        }

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

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

        builder = builder.extend_params(["--acp"]);

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Copilot {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    fn apply_session_overrides(&mut self, overrides: &ExecutorSessionOverrides) {
        if let Some(model_id) = &overrides.model_id {
            self.model = Some(model_id.clone());
        }

        if let Some(permission_policy) = &overrides.permission_policy {
            self.allow_all_tools = Some(matches!(
                permission_policy,
                crate::model_selector::PermissionPolicy::Auto
            ));
        }
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let copilot_command = self.build_command_builder()?.build_initial()?;
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
        let harness = AcpAgentHarness::new();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let copilot_command = self.build_command_builder()?.build_follow_up(&[])?;
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

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        super::acp::normalize_logs(msg_store, worktree_path);
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

    async fn available_model_config(
        &self,
        _workdir: &Path,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let config = crate::model_selector::ModelSelectorConfig {
            models: [
                ("gpt-5.2", "GPT-5.2"),
                ("gemini-3-pro-preview", "Gemini 3 Pro Preview"),
                ("claude-opus-4.5", "Claude Opus 4.5"),
                ("claude-sonnet-4.5", "Claude Sonnet 4.5"),
                ("claude-haiku-4.5", "Claude Haiku 4.5"),
                ("gpt-5.1-codex-max", "GPT-5.1 Codex Max"),
                ("gpt-5.1-codex", "GPT-5.1 Codex"),
                ("gpt-5", "GPT-5"),
                ("gpt-5.1", "GPT-5.1"),
                ("gpt-5.1-codex-mini", "GPT-5.1 Codex Mini"),
                ("gpt-5-mini", "GPT-5 Mini"),
                ("gpt-4.1", "GPT-4.1"),
                ("claude-sonnet-4", "Claude Sonnet 4"),
            ]
            .into_iter()
            .map(|(id, name)| crate::model_selector::ModelInfo {
                id: id.to_string(),
                name: name.to_string(),
                provider_id: None,
                reasoning_options: vec![],
            })
            .collect(),
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
            agent_id: None,
            reasoning_id: None,
            permission_policy: PermissionPolicy::Auto,
        }
    }
}
