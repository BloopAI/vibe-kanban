use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum_macros::AsRefStr;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
    },
};

/// Reasoning effort level for Every Code
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
}

/// Approval policy for Every Code
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum ApprovalPolicy {
    Untrusted,
    OnFailure,
    OnRequest,
    Never,
}

/// Orchestration mode for multi-agent commands
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema, AsRefStr)]
#[serde(rename_all = "kebab-case")]
#[strum(serialize_all = "kebab-case")]
pub enum OrchestrationMode {
    /// Normal single-agent mode
    Normal,
    /// /auto - Multi-step automation with self-healing
    Auto,
    /// /plan - Multi-agent consensus planning
    Plan,
    /// /solve - Competitive racing (fastest wins)
    Solve,
    /// /code - Consensus code generation
    Code,
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct EveryCode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    /// Model to use (e.g., "gpt-5.1", "claude-sonnet-4", "gemini-3-pro")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Orchestration mode for multi-agent commands
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orchestration_mode: Option<OrchestrationMode>,

    /// Reasoning effort level
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,

    /// Approval policy
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<ApprovalPolicy>,

    /// Skip approval prompts entirely (dangerous)
    #[serde(default)]
    pub no_approval: bool,

    /// Read-only mode (no file modifications)
    #[serde(default)]
    pub read_only: bool,

    /// Enable debug logging
    #[serde(default)]
    pub debug: bool,

    #[serde(flatten)]
    pub cmd: CmdOverrides,

    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl EveryCode {
    pub fn base_command() -> &'static str {
        "npx -y @just-every/code"
    }

    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new(Self::base_command());

        // Add model flag if specified
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        // Add reasoning effort
        if let Some(effort) = &self.reasoning_effort {
            builder =
                builder.extend_params(["--config", &format!("model_reasoning_effort={}", effort.as_ref())]);
        }

        // Add approval policy
        if let Some(policy) = &self.approval_policy {
            builder = builder.extend_params(["--config", &format!("approval_policy={}", policy.as_ref())]);
        }

        // No approval mode
        if self.no_approval {
            builder = builder.extend_params(["--no-approval"]);
        }

        // Read-only mode
        if self.read_only {
            builder = builder.extend_params(["--read-only"]);
        }

        // Debug mode
        if self.debug {
            builder = builder.extend_params(["--debug"]);
        }

        // Enable ACP protocol
        builder = builder.extend_params(["--experimental-acp"]);

        apply_overrides(builder, &self.cmd)
    }

    fn harness() -> AcpAgentHarness {
        AcpAgentHarness::with_session_namespace("everycode_sessions")
    }

    /// Build the prompt with orchestration mode prefix if needed
    fn build_prompt(&self, prompt: &str) -> String {
        let base_prompt = self.append_prompt.combine_prompt(prompt);

        match &self.orchestration_mode {
            Some(OrchestrationMode::Auto) => format!("/auto {}", base_prompt),
            Some(OrchestrationMode::Plan) => format!("/plan {}", base_prompt),
            Some(OrchestrationMode::Solve) => format!("/solve {}", base_prompt),
            Some(OrchestrationMode::Code) => format!("/code {}", base_prompt),
            Some(OrchestrationMode::Normal) | None => base_prompt,
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for EveryCode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let mut harness = Self::harness();
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }

        let combined_prompt = self.build_prompt(prompt);
        let command = self.build_command_builder().build_initial()?;
        let approvals = if self.no_approval {
            None
        } else {
            self.approvals.clone()
        };

        harness
            .spawn_with_command(current_dir, combined_prompt, command, env, &self.cmd, approvals)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let mut harness = Self::harness();
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
        }

        let combined_prompt = self.build_prompt(prompt);
        let command = self.build_command_builder().build_follow_up(&[])?;
        let approvals = if self.no_approval {
            None
        } else {
            self.approvals.clone()
        };

        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                command,
                env,
                &self.cmd,
                approvals,
            )
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        super::acp::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // Every Code reads from ~/.code/config.toml
        dirs::home_dir().map(|home| home.join(".code").join("config.toml"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check for auth.json (ChatGPT login) or config.toml
        if let Some(timestamp) = dirs::home_dir()
            .and_then(|home| std::fs::metadata(home.join(".code").join("auth.json")).ok())
            .and_then(|m| m.modified().ok())
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
        {
            return AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            };
        }

        // Check for config file or installation marker
        let config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_found = dirs::home_dir()
            .map(|home| home.join(".code").exists())
            .unwrap_or(false);

        if config_found || installation_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}
