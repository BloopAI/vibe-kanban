use std::path::Path;

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    env::ExecutionEnv,
    executors::{
        AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        acp::registry::registry_key,
    },
    profile::ExecutorConfig,
};

/// An agent installed from the ACP registry
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct AcpServer {
    #[schemars(
        title = "Registry ID",
        description = "ID of the agent in the ACP registry",
        extend("readOnly" = true)
    )]
    pub registry_id: String,
}

// TODO(2b-C): run the agent's npx distribution through the ACP harness, and
// fall back to the ACP normalizer for uninstalled agents' past sessions (see
// normalize_logs in services/container.rs)
#[async_trait]
impl StandardCodingAgentExecutor for AcpServer {
    async fn spawn(
        &self,
        _current_dir: &Path,
        _prompt: &str,
        _env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        Err(ExecutorError::AcpServerNotRunnable)
    }

    async fn spawn_follow_up(
        &self,
        _current_dir: &Path,
        _prompt: &str,
        _session_id: &str,
        _reset_to_message_id: Option<&str>,
        _env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        Err(ExecutorError::AcpServerNotRunnable)
    }

    async fn spawn_review(
        &self,
        _current_dir: &Path,
        _prompt: &str,
        _session_id: Option<&str>,
        _env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        Err(ExecutorError::AcpServerNotRunnable)
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        None
    }

    /// Installed means present in profiles: npx downloads the agent on first run
    fn get_availability_info(&self) -> AvailabilityInfo {
        AvailabilityInfo::InstallationFound
    }

    fn get_preset_options(&self) -> ExecutorConfig {
        ExecutorConfig::new(registry_key(&self.registry_id))
    }
}
