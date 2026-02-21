use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::CmdOverrides,
    env::ExecutionEnv,
    executor_discovery::ExecutorDiscoveredOptions,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor, claude::ClaudeCode,
    },
    logs::utils::patch,
    model_selector::{ModelInfo, ModelSelectorConfig, PermissionPolicy},
    profile::ExecutorConfig,
};

/// AWS Bedrock executor — runs Claude models via AWS Bedrock.
///
/// Credentials are passed through the standard AWS environment variables:
/// `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and
/// `AWS_REGION` (or `AWS_DEFAULT_REGION`).  The executor injects
/// `ANTHROPIC_BEDROCK_BASE_URL` so that the underlying Claude Code CLI
/// routes its API calls through Bedrock.
#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct AwsBedrock {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    /// Bedrock model ID, e.g. `us.anthropic.claude-opus-4-5-20251101-v1:0`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    /// AWS region, e.g. `us-east-1`.  Falls back to `AWS_REGION` /
    /// `AWS_DEFAULT_REGION` env vars when not set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aws_region: Option<String>,
    /// Enable plan mode (ask for approval before making changes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<bool>,
    /// Require approval for risky tool calls.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approvals: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals_service: Option<Arc<dyn ExecutorApprovalService>>,
}

impl AwsBedrock {
    /// Build an equivalent [`ClaudeCode`] executor that has Bedrock-specific
    /// env vars injected.
    fn as_claude_code(&self) -> ClaudeCode {
        let mut overrides = self.cmd.clone();

        let env_map = overrides.env.get_or_insert_with(Default::default);
        env_map
            .entry("ANTHROPIC_API_KEY".to_string())
            .or_insert_with(|| "bedrock".to_string());
        env_map.insert("CLAUDE_CODE_USE_BEDROCK".to_string(), "1".to_string());
        if let Some(region) = &self.aws_region {
            env_map.insert("AWS_REGION".to_string(), region.clone());
        }

        // Build the ClaudeCode config value and deserialize to get private
        // fields (e.g. approvals_service) zero-initialized via serde skip.
        let value = serde_json::json!({
            "append_prompt": self.append_prompt,
            "plan": self.plan,
            "approvals": self.approvals,
            "model": self.model,
            "agent": self.agent,
        });
        let mut claude: ClaudeCode = {
            // Merge cmd overrides into the value
            let mut map = value.as_object().cloned().unwrap_or_default();
            if let Ok(cmd_value) = serde_json::to_value(&overrides) {
                if let Some(cmd_obj) = cmd_value.as_object() {
                    for (k, v) in cmd_obj {
                        map.insert(k.clone(), v.clone());
                    }
                }
            }
            serde_json::from_value(serde_json::Value::Object(map))
                .expect("ClaudeCode deserialization from AwsBedrock fields should not fail")
        };
        if let Some(approvals) = self.approvals_service.clone() {
            claude.use_approvals(approvals);
        }
        claude
    }
}

fn default_discovered_options() -> ExecutorDiscoveredOptions {
    ExecutorDiscoveredOptions {
        model_selector: ModelSelectorConfig {
            providers: vec![],
            models: [
                (
                    "us.anthropic.claude-opus-4-5-20251101-v1:0",
                    "Claude Opus 4.5 (Bedrock)",
                ),
                (
                    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                    "Claude Sonnet 4.5 (Bedrock)",
                ),
                (
                    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
                    "Claude Haiku 4.5 (Bedrock)",
                ),
                (
                    "us.anthropic.claude-opus-4-20250514-v1:0",
                    "Claude Opus 4 (Bedrock)",
                ),
                (
                    "us.anthropic.claude-sonnet-4-20250514-v1:0",
                    "Claude Sonnet 4 (Bedrock)",
                ),
            ]
            .into_iter()
            .map(|(id, name)| ModelInfo {
                id: id.to_string(),
                name: name.to_string(),
                provider_id: None,
                reasoning_options: vec![],
            })
            .collect(),
            default_model: Some(
                "us.anthropic.claude-sonnet-4-5-20250929-v1:0".to_string(),
            ),
            agents: vec![],
            permissions: vec![
                PermissionPolicy::Auto,
                PermissionPolicy::Supervised,
                PermissionPolicy::Plan,
            ],
        },
        ..Default::default()
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for AwsBedrock {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
        if let Some(agent) = &executor_config.agent_id {
            self.agent = Some(agent.clone());
        }
        if let Some(permission_policy) = executor_config.permission_policy.clone() {
            match permission_policy {
                PermissionPolicy::Plan => {
                    self.plan = Some(true);
                    self.approvals = Some(false);
                }
                PermissionPolicy::Supervised => {
                    self.plan = Some(false);
                    self.approvals = Some(true);
                }
                PermissionPolicy::Auto => {
                    self.plan = Some(false);
                    self.approvals = Some(false);
                }
            }
        }
    }

    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals_service = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.as_claude_code().spawn(current_dir, prompt, env).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        self.as_claude_code()
            .spawn_follow_up(current_dir, prompt, session_id, reset_to_message_id, env)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        self.as_claude_code()
            .normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        self.as_claude_code().default_mcp_config_path()
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Bedrock is available when the Claude Code CLI is installed (same as
        // ClaudeCode) and the user has AWS credentials configured.
        let claude_available = self.as_claude_code().get_availability_info().is_available();

        let has_aws_creds = std::env::var("AWS_ACCESS_KEY_ID").is_ok()
            || std::env::var("AWS_PROFILE").is_ok()
            || dirs::home_dir()
                .map(|home| home.join(".aws").join("credentials").exists())
                .unwrap_or(false);

        if claude_available && has_aws_creds {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&Path>,
        _repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let options = default_discovered_options();
        Ok(Box::pin(futures::stream::once(async move {
            patch::executor_discovered_options(options)
        })))
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::AwsBedrock,
            variant: None,
            model_id: self.model.clone(),
            agent_id: self.agent.clone(),
            reasoning_id: None,
            permission_policy: Some(if self.plan.unwrap_or(false) {
                PermissionPolicy::Plan
            } else if self.approvals.unwrap_or(false) {
                PermissionPolicy::Supervised
            } else {
                PermissionPolicy::Auto
            }),
        }
    }
}
