use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::{Executable, SpawnContext},
    approvals::ExecutorApprovalService,
    executors::{BaseCodingAgent, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    profile::{ExecutorConfigs, ExecutorProfileId},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum CodingAgentReviewTarget {
    UncommittedChanges,
    BaseBranch { branch: String },
    Commit { sha: String, title: Option<String> },
    Custom { instructions: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CodingAgentReviewRequest {
    pub target: CodingAgentReviewTarget,
    pub append_to_original_thread: bool,
    pub session_id: Option<String>,
    /// Executor profile specification
    #[serde(alias = "profile_variant_label")]
    pub executor_profile_id: ExecutorProfileId,
}

impl CodingAgentReviewRequest {
    pub fn base_executor(&self) -> BaseCodingAgent {
        self.executor_profile_id.executor
    }

    pub fn display_prompt(&self) -> String {
        match &self.target {
            CodingAgentReviewTarget::UncommittedChanges => "Review uncommitted changes".to_string(),
            CodingAgentReviewTarget::BaseBranch { branch } => {
                format!("Review changes against `{branch}`")
            }
            CodingAgentReviewTarget::Commit { sha, title } => title
                .as_ref()
                .map(|title| format!("Review commit `{sha}` ({title})"))
                .unwrap_or_else(|| format!("Review commit `{sha}`")),
            CodingAgentReviewTarget::Custom { instructions } => instructions.clone(),
        }
    }
}

#[async_trait]
impl Executable for CodingAgentReviewRequest {
    async fn spawn(
        &self,
        current_dir: &Path,
        approvals: Arc<dyn ExecutorApprovalService>,
        context: SpawnContext,
    ) -> Result<SpawnedChild, ExecutorError> {
        let executor_profile_id = self.executor_profile_id.clone();
        let mut agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&executor_profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(
                executor_profile_id.to_string(),
            ))?;

        agent.use_approvals(approvals);
        agent.spawn_review(current_dir, self, context).await
    }
}
