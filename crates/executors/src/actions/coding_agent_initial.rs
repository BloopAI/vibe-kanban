use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::Executable,
    approvals::ExecutorApprovalService,
    env::ExecutionEnv,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    mcp_config::PRECONFIGURED_MCP_SERVERS,
    profile::{ExecutorConfigs, ExecutorProfileId},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentInitialRequest {
    pub prompt: String,
    /// Executor profile specification
    #[serde(alias = "profile_variant_label")]
    // Backwards compatability with ProfileVariantIds, esp stored in DB under ExecutorAction
    pub executor_profile_id: ExecutorProfileId,
    /// Optional relative path to execute the agent in (relative to container_ref).
    /// If None, uses the container_ref directory directly.
    #[serde(default)]
    pub working_dir: Option<String>,
    /// If true, inject the vibe_kanban MCP server into the workspace before spawning.
    /// This allows the agent to use task management tools (create_task, list_tasks, etc.).
    #[serde(default)]
    pub include_vibe_kanban_mcp: bool,
}

impl CodingAgentInitialRequest {
    pub fn base_executor(&self) -> BaseCodingAgent {
        self.executor_profile_id.executor
    }
}

#[async_trait]
impl Executable for CodingAgentInitialRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Use working_dir if specified, otherwise use current_dir
        let effective_dir = match &self.working_dir {
            Some(rel_path) => current_dir.join(rel_path),
            None => current_dir.to_path_buf(),
        };

        // If requested, inject vibe_kanban MCP server via project-scoped .mcp.json
        if self.include_vibe_kanban_mcp {
            if let Err(e) = inject_vibe_kanban_mcp(&effective_dir).await {
                tracing::warn!("Failed to inject vibe_kanban MCP config: {e}");
            }
        }

        let executor_profile_id = self.executor_profile_id.clone();
        let mut agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&executor_profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(
                executor_profile_id.to_string(),
            ))?;

        agent.use_approvals(approvals.clone());

        agent.spawn(&effective_dir, &self.prompt, env).await
    }
}

/// Inject the vibe_kanban MCP server into the workspace's .mcp.json file.
/// If the file already exists, merges the vibe_kanban server into the existing config.
/// This uses project-scoped MCP configuration so Claude Code picks it up automatically.
async fn inject_vibe_kanban_mcp(workspace_dir: &Path) -> Result<(), ExecutorError> {
    let mcp_json_path = workspace_dir.join(".mcp.json");

    // Get the vibe_kanban server config from preconfigured servers
    let vibe_kanban_config = PRECONFIGURED_MCP_SERVERS
        .get("vibe_kanban")
        .cloned()
        .unwrap_or_else(|| {
            // Fallback in case it's not in preconfigured
            serde_json::json!({
                "command": "npx",
                "args": ["-y", "vibe-kanban@latest", "--mcp"]
            })
        });

    // Read existing config or start fresh
    let mut mcp_config: serde_json::Value = if mcp_json_path.exists() {
        match tokio::fs::read_to_string(&mcp_json_path).await {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| {
                serde_json::json!({ "mcpServers": {} })
            }),
            Err(_) => serde_json::json!({ "mcpServers": {} }),
        }
    } else {
        serde_json::json!({ "mcpServers": {} })
    };

    // Ensure mcpServers object exists
    if !mcp_config.get("mcpServers").is_some() {
        mcp_config["mcpServers"] = serde_json::json!({});
    }

    // Inject vibe_kanban server (overwrites if already present)
    mcp_config["mcpServers"]["vibe_kanban"] = vibe_kanban_config;

    let content = serde_json::to_string_pretty(&mcp_config)?;
    tokio::fs::write(&mcp_json_path, content).await?;

    tracing::info!("Injected vibe_kanban MCP config to {}", mcp_json_path.display());
    Ok(())
}
