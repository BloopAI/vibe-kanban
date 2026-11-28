use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
use super::acp::{
    AcpAgentHarnessV2,
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
    logs::utils::patch,
    model_selector::{ModelInfo, ModelSelectorConfig, PermissionPolicy},
    profile::ExecutorConfig,
};

/// Gemini's entry in the ACP registry, which gives the package and args to run.
const REGISTRY_ID: &str = "gemini";

/// Used only when there's no registry copy in memory or on disk. Unversioned, so there's no pin
/// to bump.
const FALLBACK_PACKAGE: &str = "@google/gemini-cli";

/// Gemini's approval mode that auto-approves every tool, set over ACP for Auto.
const YOLO_MODE: &str = "yolo";

const SUPPRESSED_STDERR_PATTERNS: &[&str] = &[
    "was started but never ended. Skipping metrics.",
    "YOLO mode is enabled. All tool calls will be automatically approved.",
];

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Gemini {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

impl Gemini {
    fn permission_policy(&self) -> PermissionPolicy {
        if self.yolo.unwrap_or(false) {
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
            command_from(registry::find_npx(REGISTRY_ID).await.as_ref())
        }
    }

    /// `base` already carries the registry args (`--acp`). Model and permissions are set over ACP
    /// after the session opens (`desired_config`), not as flags.
    fn build_command_builder(
        &self,
        base: CommandBuilder,
    ) -> Result<CommandBuilder, CommandBuildError> {
        apply_overrides(base, &self.cmd)
    }

    /// Auto switches Gemini to its YOLO mode, so it doesn't ask in the first place.
    fn desired_config(&self) -> DesiredConfig {
        let permission = self.permission_policy();
        DesiredConfig {
            model: self.model.clone(),
            mode: (permission == PermissionPolicy::Auto).then(|| YOLO_MODE.to_string()),
            permission: Some(permission),
            ..Default::default()
        }
    }
}

/// The registry's package and args, else `npx -y @google/gemini-cli --acp`.
fn command_from(npx: Option<&NpxDistribution>) -> CommandBuilder {
    if let Some(npx) = npx {
        match npx_command(REGISTRY_ID, npx) {
            Ok(command) => return command,
            Err(e) => tracing::warn!("{e}; using {FALLBACK_PACKAGE}"),
        }
    }
    CommandBuilder::new(format!("npx -y {FALLBACK_PACKAGE}")).extend_params(["--acp"])
}

#[async_trait]
impl StandardCodingAgentExecutor for Gemini {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
        if let Some(permission_policy) = &executor_config.permission_policy {
            self.yolo = Some(matches!(permission_policy, PermissionPolicy::Auto));
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
        let harness = AcpAgentHarnessV2::new().with_config(self.desired_config());
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let gemini_command = self
            .build_command_builder(self.base_command().await)?
            .build_initial()?;
        harness
            .spawn_with_command(
                current_dir,
                combined_prompt,
                gemini_command,
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
            .with_legacy_sessions("gemini_sessions")
            .with_config(self.desired_config());
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let gemini_command = self
            .build_command_builder(self.base_command().await)?
            .build_follow_up(&[])?;
        harness
            .spawn_follow_up_with_command(
                current_dir,
                combined_prompt,
                session_id,
                gemini_command,
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
        super::acp::normalize_logs_with_suppressed_stderr_patterns(
            msg_store,
            worktree_path,
            SUPPRESSED_STDERR_PATTERNS,
        )
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".gemini").join("settings.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        if let Some(timestamp) = dirs::home_dir()
            .and_then(|home| std::fs::metadata(home.join(".gemini").join("oauth_creds.json")).ok())
            .and_then(|m| m.modified().ok())
            .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
        {
            return AvailabilityInfo::LoginDetected {
                last_auth_timestamp: timestamp,
            };
        }

        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let installation_indicator_found = dirs::home_dir()
            .map(|home| home.join(".gemini").join("installation_id").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::gemini(),
            variant: None,
            model_id: self.model.clone(),
            agent_id: None,
            reasoning_id: None,
            permission_policy: Some(self.permission_policy()),
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&std::path::Path>,
        _repo_path: Option<&std::path::Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let options = ExecutorDiscoveredOptions {
            model_selector: ModelSelectorConfig {
                models: vec![
                    ModelInfo {
                        id: "gemini-3.1-pro-preview".to_string(),
                        name: "Gemini 3.1 Pro Preview".to_string(),
                        provider_id: None,
                        reasoning_options: vec![],
                    },
                    ModelInfo {
                        id: "gemini-3-pro-preview".to_string(),
                        name: "Gemini 3 Pro".to_string(),
                        provider_id: None,
                        reasoning_options: vec![],
                    },
                    ModelInfo {
                        id: "gemini-3-flash-preview".to_string(),
                        name: "Gemini 3 Flash".to_string(),
                        provider_id: None,
                        reasoning_options: vec![],
                    },
                ],
                default_model: Some("gemini-3-pro-preview".to_string()),
                permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
                ..Default::default()
            },
            ..Default::default()
        };
        Ok(Box::pin(futures::stream::once(async move {
            patch::executor_discovered_options(options)
        })))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gemini() -> Gemini {
        serde_json::from_value(serde_json::json!({})).unwrap()
    }

    fn registry_entry() -> NpxDistribution {
        NpxDistribution {
            package: "@google/gemini-cli@0.68.0".into(),
            args: vec!["--acp".into()],
            env: Default::default(),
        }
    }

    #[test]
    fn command_from_registry_entry() {
        let command = command_from(Some(&registry_entry()));
        assert_eq!(command.base, "npx -y @google/gemini-cli@0.68.0");
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn command_falls_back_without_registry() {
        let command = command_from(None);
        assert_eq!(command.base, "npx -y @google/gemini-cli");
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn invalid_registry_package_falls_back() {
        let npx = NpxDistribution {
            package: "@google/gemini-cli --evil".into(),
            ..registry_entry()
        };
        assert_eq!(command_from(Some(&npx)).base, "npx -y @google/gemini-cli");
    }

    /// Model and permissions go over ACP only, never as CLI flags.
    #[test]
    fn run_command_has_no_model_or_yolo_flags() {
        let mut g = gemini();
        g.model = Some("gemini-3-flash-preview".into());
        g.yolo = Some(true);
        let command = g
            .build_command_builder(command_from(Some(&registry_entry())))
            .unwrap();
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn base_command_override_keeps_acp() {
        let mut g = gemini();
        g.cmd.base_command_override = Some("my-gemini-wrapper".into());
        let command = g.build_command_builder(command_from(None)).unwrap();
        assert_eq!(command.base, "my-gemini-wrapper");
        assert_eq!(command.params, Some(vec!["--acp".to_string()]));
    }

    #[test]
    fn auto_selects_yolo_mode() {
        let mut g = gemini();
        g.apply_overrides(&ExecutorConfig {
            executor: BaseCodingAgent::gemini(),
            variant: None,
            model_id: Some("gemini-3-flash-preview".into()),
            agent_id: None,
            reasoning_id: None,
            permission_policy: Some(PermissionPolicy::Auto),
        });
        let desired = g.desired_config();
        assert_eq!(desired.model.as_deref(), Some("gemini-3-flash-preview"));
        assert_eq!(desired.mode.as_deref(), Some("yolo"));
        assert!(desired.auto_approve());
    }

    #[test]
    fn supervised_leaves_the_mode_alone() {
        let desired = gemini().desired_config();
        assert_eq!(desired.permission, Some(PermissionPolicy::Supervised));
        assert_eq!(desired.mode, None);
        assert!(!desired.auto_approve());
    }
}
