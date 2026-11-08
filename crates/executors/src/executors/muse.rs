use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executor_discovery::ExecutorDiscoveredOptions,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, SpawnedChild,
        StandardCodingAgentExecutor,
    },
    logs::utils::patch,
    model_selector::{ModelInfo, ModelSelectorConfig, PermissionPolicy, ReasoningOption},
    profile::ExecutorConfig,
};

pub mod normalize_logs;

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Muse {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yolo: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_model_steps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_sandbox: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Muse {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("muse exec").params(["--json"]);

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }
        if let Some(effort) = &self.reasoning_effort {
            builder = builder.extend_params(["--reasoning-effort", effort.as_str()]);
        }
        if let Some(steps) = self.max_model_steps {
            let steps = steps.to_string();
            builder = builder.extend_params(["--max-model-steps", steps.as_str()]);
        }
        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
        } else {
            builder = builder.extend_params(["--disable-approval"]);
        }
        if self.disable_sandbox.unwrap_or(false) {
            builder = builder.extend_params(["--disable-sandbox"]);
        }
        builder = builder.extend_params(["--trust-workspace"]);

        apply_overrides(builder, &self.cmd)
    }
}

async fn spawn_muse(
    command_parts: crate::command::CommandParts,
    current_dir: &Path,
    env: &ExecutionEnv,
    cmd_overrides: &CmdOverrides,
) -> Result<SpawnedChild, ExecutorError> {
    use std::process::Stdio;

    use tokio::process::Command;
    use workspace_utils::command_ext::GroupSpawnNoWindowExt;

    let (program_path, args) = command_parts.into_resolved().await?;

    let mut command = Command::new(program_path);
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(current_dir)
        .env("NPM_CONFIG_LOGLEVEL", "error")
        .args(args);

    env.clone()
        .with_profile(cmd_overrides)
        .apply_to_command(&mut command);

    let child = command.group_spawn_no_window()?;
    Ok(child.into())
}

#[async_trait]
impl StandardCodingAgentExecutor for Muse {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = &executor_config.model_id {
            self.model = Some(model_id.clone());
        }
        if let Some(reasoning_id) = &executor_config.reasoning_id {
            self.reasoning_effort = Some(reasoning_id.clone());
        }
        if let Some(permission_policy) = executor_config.permission_policy.clone() {
            self.yolo = Some(matches!(
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
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let command = self
            .build_command_builder()?
            .build_follow_up(&[combined_prompt])?;
        spawn_muse(command, current_dir, env, &self.cmd).await
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
        let command = self.build_command_builder()?.build_follow_up(&[
            "--session-id".to_string(),
            session_id.to_string(),
            combined_prompt,
        ])?;
        spawn_muse(command, current_dir, env, &self.cmd).await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        let entry_index_provider = crate::logs::utils::EntryIndexProvider::start_from(&msg_store);
        normalize_logs::normalize_logs(msg_store.clone(), worktree_path, entry_index_provider)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".config").join("muse").join("settings.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let settings_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        let data_dir_found = dirs::home_dir()
            .map(|home| home.join(".local").join("share").join("muse").exists())
            .unwrap_or(false);

        if settings_found || data_dir_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::Muse,
            variant: None,
            model_id: self.model.clone(),
            agent_id: None,
            reasoning_id: self.reasoning_effort.clone(),
            permission_policy: Some(if self.yolo.unwrap_or(false) {
                PermissionPolicy::Auto
            } else {
                PermissionPolicy::Supervised
            }),
        }
    }

    async fn discover_options(
        &self,
        _workdir: Option<&std::path::Path>,
        _repo_path: Option<&std::path::Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let efforts = ReasoningOption::from_names([
            "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
        ]);
        let options = ExecutorDiscoveredOptions {
            model_selector: ModelSelectorConfig {
                models: vec![
                    ModelInfo {
                        id: "muse-wonder-1.0".to_string(),
                        name: "Muse Wonder 1.0".to_string(),
                        provider_id: None,
                        reasoning_options: efforts.clone(),
                    },
                    ModelInfo {
                        id: "muse-spark-1.3".to_string(),
                        name: "Muse Spark 1.3".to_string(),
                        provider_id: None,
                        reasoning_options: efforts.clone(),
                    },
                    ModelInfo {
                        id: "muse-spark-1.2".to_string(),
                        name: "Muse Spark 1.2".to_string(),
                        provider_id: None,
                        reasoning_options: efforts.clone(),
                    },
                    ModelInfo {
                        id: "muse-spark-1.1".to_string(),
                        name: "Muse Spark 1.1".to_string(),
                        provider_id: None,
                        reasoning_options: efforts.clone(),
                    },
                ],
                default_model: Some("muse-spark-1.2".to_string()),
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
