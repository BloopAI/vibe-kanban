use std::{collections::BTreeMap, path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use derivative::Derivative;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

pub use super::acp::AcpAgentHarness;
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
    model_selector::{ModelInfo, ModelProvider, ModelSelectorConfig, PermissionPolicy},
    profile::ExecutorConfig,
};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct Omp {
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

/// One entry of `omp models --json`, abbreviated to the fields this executor uses.
/// `selector` is omitted on purpose: it is always `{provider}/{id}`, and the UI
/// rebuilds that pair itself.
#[derive(Debug, Deserialize)]
struct OmpModelEntry {
    provider: String,
    id: String,
    name: String,
    /// `null` for models that expose no reasoning levels at all.
    #[serde(default)]
    thinking: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct OmpModelList {
    #[serde(default)]
    models: Vec<OmpModelEntry>,
}

/// Group the flat `omp models` catalog by provider so the picker shows one
/// submenu per provider instead of a single 290-row list.
fn collect_models(list: OmpModelList) -> ModelSelectorConfig {
    let mut by_provider: BTreeMap<String, Vec<ModelInfo>> = BTreeMap::new();
    let mut providers: BTreeMap<String, ModelProvider> = BTreeMap::new();

    for entry in list.models {
        providers
            .entry(entry.provider.clone())
            .or_insert_with(|| ModelProvider {
                id: entry.provider.clone(),
                name: entry.provider.clone(),
            });
        by_provider
            .entry(entry.provider.clone())
            .or_default()
            .push(ModelInfo {
                id: entry.id,
                name: entry.name,
                provider_id: Some(entry.provider),
                reasoning_options: crate::model_selector::ReasoningOption::from_names(
                    entry.thinking.unwrap_or_default(),
                ),
            });
    }

    let mut models = Vec::new();
    for mut provider_models in by_provider.into_values() {
        provider_models.sort_by(|a, b| a.name.cmp(&b.name));
        models.extend(provider_models);
    }

    ModelSelectorConfig {
        providers: providers.into_values().collect(),
        models,
        default_model: None,
        agents: vec![],
        permissions: vec![PermissionPolicy::Auto, PermissionPolicy::Supervised],
    }
}

impl Omp {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("omp acp");

        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }

        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
        }

        apply_overrides(builder, &self.cmd)
    }

    /// Ask the installed `omp` binary for its catalog so the UI picker lists
    /// exactly the models this machine can actually route to.
    async fn query_models(&self) -> Result<OmpModelList, ExecutorError> {
        let base = self
            .cmd
            .base_command_override
            .clone()
            .unwrap_or_else(|| "omp".to_string());
        let program = base
            .split_whitespace()
            .next()
            .filter(|p| !p.is_empty())
            .ok_or(CommandBuildError::EmptyCommand)?;

        let output = Command::new(program)
            .arg("models")
            .arg("--json")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(ExecutorError::Io)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(ExecutorError::Io(std::io::Error::other(if stderr.is_empty() {
                format!("`{program} models --json` exited with {}", output.status)
            } else {
                format!("`{program} models --json` failed: {stderr}")
            })));
        }

        serde_json::from_slice::<OmpModelList>(&output.stdout).map_err(ExecutorError::Json)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Omp {
    fn apply_overrides(&mut self, executor_config: &ExecutorConfig) {
        if let Some(model_id) = executor_config.model_id.as_ref() {
            self.model = Some(model_id.clone());
        }

        if let Some(permission_policy) = executor_config.permission_policy.clone() {
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
        let omp_command = self.build_command_builder()?.build_initial()?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mut harness = AcpAgentHarness::with_session_namespace("omp_sessions");
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
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
                omp_command,
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
        let omp_command = self.build_command_builder()?.build_follow_up(&[])?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);
        let mut harness = AcpAgentHarness::with_session_namespace("omp_sessions");
        if let Some(model) = &self.model {
            harness = harness.with_model(model);
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
                omp_command,
                env,
                &self.cmd,
                approvals,
            )
            .await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
    ) -> Vec<tokio::task::JoinHandle<()>> {
        crate::executors::acp::normalize_logs(msg_store, worktree_path)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".omp").join("agent").join("mcp.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // `omp` keeps credentials and model catalogs under ~/.omp/agent, so the
        // directory appearing at all means the CLI has been set up on this host.
        let agent_dir = match dirs::home_dir() {
            Some(home) => home.join(".omp").join("agent"),
            None => return AvailabilityInfo::NotFound,
        };

        if agent_dir.join("config.yml").exists()
            || agent_dir.join("models.yml").exists()
            || agent_dir.join("auth.json").exists()
        {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig {
            executor: BaseCodingAgent::Omp,
            variant: None,
            model_id: self.model.clone(),
            agent_id: None,
            reasoning_id: None,
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
        let permissions = vec![PermissionPolicy::Auto, PermissionPolicy::Supervised];
        let provisional = ExecutorDiscoveredOptions {
            model_selector: ModelSelectorConfig {
                permissions: permissions.clone(),
                ..Default::default()
            },
            ..Default::default()
        }
        .with_loading(true);
        let initial_patch = patch::executor_discovered_options(provisional);

        let this = self.clone();
        let discovery_stream = async_stream::stream! {
            match this.query_models().await {
                Ok(list) => {
                    let mut config = collect_models(list);
                    config.permissions = permissions;
                    yield patch::update_providers(config.providers.clone());
                    yield patch::update_models(config.models);
                    yield patch::models_loaded();
                }
                Err(err) => {
                    tracing::warn!("Failed to list omp models: {err}");
                    yield patch::discovery_error(err.to_string());
                }
            }
        };

        Ok(Box::pin(
            futures::stream::once(async move { initial_patch }).chain(discovery_stream),
        ))
    }
}
