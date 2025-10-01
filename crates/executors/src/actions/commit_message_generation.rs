use std::path::Path;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::Executable,
    executors::{ExecutorError, StandardCodingAgentExecutor},
    profile::{ExecutorConfigs, ExecutorProfileId},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct CommitMessageGenerationRequest {
    pub task_title: String,
    pub task_description: Option<String>,
    pub session_id: String,
    /// Base branch to compare against for diff
    pub base_branch: String,
    /// Current branch with changes
    pub current_branch: String,
    /// Executor profile specification
    #[serde(alias = "profile_variant_label")]
    pub executor_profile_id: ExecutorProfileId,
}

impl CommitMessageGenerationRequest {
    pub fn new(
        task_title: String,
        task_description: Option<String>,
        session_id: String,
        base_branch: String,
        current_branch: String,
        executor_profile_id: ExecutorProfileId,
    ) -> Self {
        Self {
            task_title,
            task_description,
            session_id,
            base_branch,
            current_branch,
            executor_profile_id,
        }
    }

    /// Get the executor profile ID
    pub fn get_executor_profile_id(&self) -> ExecutorProfileId {
        self.executor_profile_id.clone()
    }

    /// Build the commit message generation prompt
    pub fn build_prompt(&self) -> String {
        let mut prompt = String::new();

        prompt.push_str("Please generate a conventional commit message for the changes you made in this task.\n\n");

        prompt.push_str("TASK CONTEXT:\n");
        prompt.push_str(&format!("Title: {}\n", self.task_title));

        if let Some(description) = &self.task_description {
            prompt.push_str(&format!("Description: {}\n", description));
        }

        prompt.push_str(&format!("Base branch: {}\n", self.base_branch));
        prompt.push_str(&format!("Current branch: {}\n", self.current_branch));

        prompt.push_str("\nINSTRUCTIONS:\n");
        prompt.push_str("1. First, examine the diff between the base branch and current branch to understand what changes were made\n");
        prompt.push_str("2. Based on your conversation history and the actual changes, generate a conventional commit message\n");
        prompt.push_str("3. Follow conventional commit format: <type>[optional scope]: <description>\n");
        prompt.push_str("4. Types: feat, fix, docs, style, refactor, perf, test, chore\n");
        prompt.push_str("5. Keep the first line under 72 characters\n");
        prompt.push_str("6. Use imperative mood (\"add\" not \"adds\" or \"added\")\n");
        prompt.push_str("7. Focus on WHAT was changed and WHY, leveraging your context from our conversation\n");
        prompt.push_str("8. If there are multiple logical changes, choose the most significant one for the type\n\n");

        prompt.push_str("Please respond with ONLY the commit message, nothing else. Do not include explanations or additional text.\n");
        prompt.push_str("Example format:\n");
        prompt.push_str("feat(auth): implement user authentication system\n\n");
        prompt.push_str("Add JWT-based login with session management and password hashing");

        prompt
    }
}

#[async_trait]
impl Executable for CommitMessageGenerationRequest {
    async fn spawn(&self, current_dir: &Path) -> Result<AsyncGroupChild, ExecutorError> {
        let executor_profile_id = self.get_executor_profile_id();
        let agent = ExecutorConfigs::get_cached()
            .get_coding_agent(&executor_profile_id)
            .ok_or(ExecutorError::UnknownExecutorType(
                executor_profile_id.to_string(),
            ))?;

        let prompt = self.build_prompt();
        agent
            .spawn_follow_up(current_dir, &prompt, &self.session_id)
            .await
    }
}