use std::{path::Path, time::Duration};

use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;

use crate::services::git::GitService;
use utils::diff::Diff;
use db::models::{executor_session::ExecutorSession, task_attempt::TaskAttempt};
use sqlx::SqlitePool;

#[derive(Debug, Error)]
pub enum CommitMessageError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    #[error("JSON serialization/deserialization failed: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Git operation failed: {0}")]
    GitError(String),
    #[error("No API key configured for LLM provider")]
    NoApiKey,
    #[error("LLM API error: {0}")]
    LlmApiError(String),
}

#[derive(Debug, Clone)]
pub enum LlmProvider {
    Anthropic,
    OpenAI,
}

#[derive(Debug, Clone)]
pub struct CommitMessageConfig {
    pub provider: LlmProvider,
    pub api_key: String,
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

impl CommitMessageConfig {
    pub fn from_env() -> Option<Self> {
        // Try Anthropic first
        if let Some(api_key) = std::env::var("ANTHROPIC_API_KEY").ok() {
            return Some(Self {
                provider: LlmProvider::Anthropic,
                api_key,
                model: "claude-3-haiku-20240307".to_string(),
                max_tokens: 300,
                temperature: 0.1,
            });
        }

        // Fall back to OpenAI
        if let Some(api_key) = std::env::var("OPENAI_API_KEY").ok() {
            return Some(Self {
                provider: LlmProvider::OpenAI,
                api_key,
                model: "gpt-4o-mini".to_string(),
                max_tokens: 300,
                temperature: 0.1,
            });
        }

        None
    }
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    temperature: f32,
    messages: Vec<AnthropicMessage>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    text: String,
}

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    max_tokens: u32,
    temperature: f32,
    messages: Vec<OpenAIMessage>,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponseMessage {
    content: String,
}

#[derive(Clone)]
pub struct CommitMessageService {
    config: Option<CommitMessageConfig>,
    client: reqwest::Client,
}

impl CommitMessageService {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap();

        Self {
            config: CommitMessageConfig::from_env(),
            client,
        }
    }

    pub fn is_available(&self) -> bool {
        self.config.is_some()
    }

    /// Generate commit message using the task's agent session if available, fallback to LLM API
    pub async fn generate_commit_message_with_agent(
        &self,
        pool: &SqlitePool,
        task_attempt: &TaskAttempt,
        task_title: &str,
        task_description: Option<&str>,
    ) -> Result<String, CommitMessageError> {
        // First try to get the latest executor session for this task attempt
        if let Ok(Some(executor_session)) = ExecutorSession::find_latest_by_task_attempt_id(pool, task_attempt.id).await {
            if let Some(session_id) = &executor_session.session_id {
                tracing::info!("Found executor session {} for task attempt {}, trying agent-based commit message generation", session_id, task_attempt.id);

                // Try to generate commit message using the agent with full context
                match self.generate_with_agent(task_attempt, task_title, task_description, session_id).await {
                    Ok(message) => {
                        tracing::info!("Successfully generated commit message using agent: {}", message);
                        return Ok(message);
                    }
                    Err(err) => {
                        tracing::warn!("Agent-based generation failed: {}, falling back to LLM API", err);
                    }
                }
            }
        }

        // Fallback to the original LLM API approach
        tracing::info!("Falling back to LLM API for commit message generation");

        // We need diffs for the API approach - get them here
        let git_service = GitService::new();
        let container_ref = task_attempt.container_ref.as_ref().ok_or_else(|| {
            CommitMessageError::GitError("No container reference found for task attempt".to_string())
        })?;
        let worktree_path = Path::new(container_ref);

        // Get branch name
        let branch_name = task_attempt.branch.as_ref().ok_or_else(|| {
            CommitMessageError::GitError("No branch found for task attempt".to_string())
        })?;

        let base_commit = git_service.get_base_commit(
            worktree_path,
            branch_name,
            &task_attempt.base_branch,
        ).map_err(|e| CommitMessageError::GitError(e.to_string()))?;

        let diff_target = crate::services::git::DiffTarget::Worktree {
            worktree_path,
            base_commit: &base_commit,
        };

        let diffs = git_service.get_diffs(diff_target, None)
            .map_err(|e| CommitMessageError::GitError(e.to_string()))?;

        self.generate_commit_message(&diffs, task_title, task_description).await
    }

    pub async fn generate_commit_message(
        &self,
        diffs: &[Diff],
        task_title: &str,
        task_description: Option<&str>,
    ) -> Result<String, CommitMessageError> {
        let config = self.config.as_ref().ok_or(CommitMessageError::NoApiKey)?;

        // Create a summary of changes
        let changes_summary = self.summarize_diffs(diffs);

        // Build the prompt
        let prompt = self.build_prompt(task_title, task_description, &changes_summary);

        // Call the appropriate LLM
        match &config.provider {
            LlmProvider::Anthropic => self.call_anthropic(&prompt, config).await,
            LlmProvider::OpenAI => self.call_openai(&prompt, config).await,
        }
    }

    fn summarize_diffs(&self, diffs: &[Diff]) -> String {
        if diffs.is_empty() {
            return "No changes detected".to_string();
        }

        let mut summary = Vec::new();

        for diff in diffs {
            let file_path = diff.new_path
                .as_ref()
                .or(diff.old_path.as_ref())
                .unwrap_or(&"unknown".to_string());

            let change_type = match diff.change {
                utils::diff::DiffChangeKind::Added => "added",
                utils::diff::DiffChangeKind::Deleted => "deleted",
                utils::diff::DiffChangeKind::Modified => "modified",
                utils::diff::DiffChangeKind::Renamed => "renamed",
                utils::diff::DiffChangeKind::Copied => "copied",
                utils::diff::DiffChangeKind::PermissionChange => "permission changed",
            };

            summary.push(format!("- {} {}", change_type, file_path));
        }

        summary.join("\n")
    }

    fn build_prompt(&self, task_title: &str, task_description: Option<&str>, changes_summary: &str) -> String {
        let mut prompt = String::new();

        prompt.push_str("Generate a concise, conventional commit message based on the following information:\n\n");
        prompt.push_str("TASK:\n");
        prompt.push_str(&format!("Title: {}\n", task_title));

        if let Some(description) = task_description {
            prompt.push_str(&format!("Description: {}\n", description));
        }

        prompt.push_str("\nFILE CHANGES:\n");
        prompt.push_str(changes_summary);

        prompt.push_str("\n\nPlease generate a commit message following these guidelines:");
        prompt.push_str("\n- Use conventional commit format: <type>[scope]: <description>");
        prompt.push_str("\n- Types: feat, fix, docs, style, refactor, perf, test, chore");
        prompt.push_str("\n- Keep the description concise and clear (max 72 characters for the first line)");
        prompt.push_str("\n- Focus on WHAT was changed and WHY, not HOW");
        prompt.push_str("\n- Use imperative mood (\"add\" not \"adds\" or \"added\")");
        prompt.push_str("\n- Do not include task IDs or references in the main message");
        prompt.push_str("\n\nReturn ONLY the commit message, nothing else:");

        prompt
    }

    async fn call_anthropic(&self, prompt: &str, config: &CommitMessageConfig) -> Result<String, CommitMessageError> {
        let request = AnthropicRequest {
            model: config.model.clone(),
            max_tokens: config.max_tokens,
            temperature: config.temperature,
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response = self.client
            .post("https://api.anthropic.com/v1/messages")
            .header("Content-Type", "application/json")
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(CommitMessageError::LlmApiError(format!(
                "Anthropic API error: {}",
                error_text
            )));
        }

        let anthropic_response: AnthropicResponse = response.json().await?;

        if let Some(content) = anthropic_response.content.first() {
            Ok(content.text.trim().to_string())
        } else {
            Err(CommitMessageError::LlmApiError(
                "No content in Anthropic response".to_string()
            ))
        }
    }

    async fn call_openai(&self, prompt: &str, config: &CommitMessageConfig) -> Result<String, CommitMessageError> {
        let request = OpenAIRequest {
            model: config.model.clone(),
            max_tokens: config.max_tokens,
            temperature: config.temperature,
            messages: vec![OpenAIMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(CommitMessageError::LlmApiError(format!(
                "OpenAI API error: {}",
                error_text
            )));
        }

        let openai_response: OpenAIResponse = response.json().await?;

        if let Some(choice) = openai_response.choices.first() {
            Ok(choice.message.content.trim().to_string())
        } else {
            Err(CommitMessageError::LlmApiError(
                "No choices in OpenAI response".to_string()
            ))
        }
    }

    pub fn generate_fallback_message(&self, task_title: &str, task_description: Option<&str>, task_id: &str) -> String {
        let task_uuid_str = task_id.to_string();
        let first_uuid_section = task_uuid_str.split('-').next().unwrap_or(&task_uuid_str);

        let mut commit_message = format!("{} (vibe-kanban {})", task_title, first_uuid_section);

        if let Some(description) = task_description {
            if !description.trim().is_empty() {
                commit_message.push_str("\n\n");
                commit_message.push_str(description);
            }
        }

        commit_message
    }

    /// Generate commit message using the existing agent session
    async fn generate_with_agent(
        &self,
        task_attempt: &TaskAttempt,
        task_title: &str,
        task_description: Option<&str>,
        session_id: &str,
    ) -> Result<String, CommitMessageError> {
        use executors::{
            actions::{coding_agent_follow_up::CodingAgentFollowUpRequest, ExecutorActionType, Executable},
            profile::ExecutorProfileId,
        };
        use tokio::io::{AsyncBufReadExt, BufReader};
        use tokio::time::{timeout, Duration as TokioDuration};

        // Build the prompt for the agent
        let prompt = self.build_agent_prompt(task_title, task_description, &task_attempt.base_branch);

        // Get the container path for execution
        let container_ref = task_attempt.container_ref.as_ref().ok_or_else(|| {
            CommitMessageError::GitError("No container reference found for task attempt".to_string())
        })?;
        let worktree_path = Path::new(container_ref);

        // Parse executor profile from task_attempt.executor
        let executor_profile_id = ExecutorProfileId::parse(&task_attempt.executor)
            .map_err(|e| CommitMessageError::LlmApiError(format!("Invalid executor profile: {}", e)))?;

        // Create a follow-up request
        let follow_up_request = CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id: session_id.to_string(),
            executor_profile_id,
        };

        // Spawn the agent process
        let mut child = follow_up_request.spawn(worktree_path).await
            .map_err(|e| CommitMessageError::LlmApiError(format!("Failed to spawn agent: {}", e)))?;

        // Capture stdout
        let stdout = child.inner_mut().stdout.take().ok_or_else(|| {
            CommitMessageError::LlmApiError("Failed to capture agent stdout".to_string())
        })?;

        let mut reader = BufReader::new(stdout).lines();
        let mut last_non_empty_line = String::new();

        // Read output with timeout (60 seconds)
        let read_result = timeout(TokioDuration::from_secs(60), async {
            while let Ok(Some(line)) = reader.next_line().await {
                // Skip empty lines and lines that look like logging
                let trimmed = line.trim();
                if !trimmed.is_empty()
                    && !trimmed.starts_with("INFO")
                    && !trimmed.starts_with("WARN")
                    && !trimmed.starts_with("ERROR")
                    && !trimmed.starts_with("DEBUG")
                    && !trimmed.starts_with('[')
                    && !trimmed.starts_with('{')  // Skip JSON lines
                {
                    last_non_empty_line = trimmed.to_string();
                }
            }
            Ok::<(), CommitMessageError>(())
        }).await;

        // Kill the process after capturing output
        let _ = child.kill();

        match read_result {
            Ok(_) => {
                if last_non_empty_line.is_empty() {
                    return Err(CommitMessageError::LlmApiError(
                        "Agent returned empty commit message".to_string()
                    ));
                }
            }
            Err(_) => {
                return Err(CommitMessageError::LlmApiError(
                    "Timeout waiting for agent response".to_string()
                ));
            }
        }

        // Clean up the commit message - remove any markdown code blocks
        let commit_message = last_non_empty_line
            .trim()
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .to_string();

        if commit_message.is_empty() {
            return Err(CommitMessageError::LlmApiError(
                "Cleaned commit message is empty".to_string()
            ));
        }

        Ok(commit_message)
    }

    /// Build a prompt specifically for agent-based commit message generation
    fn build_agent_prompt(&self, task_title: &str, task_description: Option<&str>, base_branch: &str) -> String {
        let mut prompt = String::new();

        prompt.push_str("Please generate a conventional commit message for the changes you just made.\n\n");

        prompt.push_str("TASK CONTEXT:\n");
        prompt.push_str(&format!("Title: {}\n", task_title));

        if let Some(description) = task_description {
            prompt.push_str(&format!("Description: {}\n", description));
        }

        prompt.push_str(&format!("Base branch: {}\n", base_branch));

        prompt.push_str("\nINSTRUCTIONS:\n");
        prompt.push_str("1. Look at the git diff to understand what changes you made\n");
        prompt.push_str("2. Based on our conversation history and the actual changes, create a conventional commit message\n");
        prompt.push_str("3. Use conventional commit format: <type>[optional scope]: <description>\n");
        prompt.push_str("4. Types: feat, fix, docs, style, refactor, perf, test, chore\n");
        prompt.push_str("5. Keep the first line under 72 characters\n");
        prompt.push_str("6. Use imperative mood (\"add\" not \"adds\" or \"added\")\n");
        prompt.push_str("7. Focus on WHAT was changed and WHY, based on our conversation\n");
        prompt.push_str("8. You have full context of what we discussed and implemented\n\n");

        prompt.push_str("Respond with ONLY the commit message, nothing else.\n");
        prompt.push_str("Example: feat(auth): implement JWT-based user authentication");

        prompt
    }
}

impl Default for CommitMessageService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use utils::diff::{Diff, DiffChangeKind};

    #[test]
    fn test_service_creation() {
        let service = CommitMessageService::new();
        // Should always be able to create service
        assert!(!service.is_available()); // No API key in test environment
    }

    #[test]
    fn test_fallback_message_generation() {
        let service = CommitMessageService::new();

        let message = service.generate_fallback_message(
            "Add user authentication",
            Some("This adds login and registration"),
            "12345678-1234-1234-1234-123456789012"
        );

        assert!(message.contains("Add user authentication"));
        assert!(message.contains("vibe-kanban 12345678"));
        assert!(message.contains("This adds login and registration"));
    }

    #[test]
    fn test_fallback_message_without_description() {
        let service = CommitMessageService::new();

        let message = service.generate_fallback_message(
            "Fix bug in parser",
            None,
            "87654321-4321-4321-4321-210987654321"
        );

        assert!(message.contains("Fix bug in parser"));
        assert!(message.contains("vibe-kanban 87654321"));
        assert!(!message.contains("\n\n")); // No description section
    }

    #[test]
    fn test_summarize_diffs_empty() {
        let service = CommitMessageService::new();
        let diffs: Vec<Diff> = vec![];

        let summary = service.summarize_diffs(&diffs);
        assert_eq!(summary, "No changes detected");
    }

    #[test]
    fn test_summarize_diffs_with_changes() {
        let service = CommitMessageService::new();
        let diffs = vec![
            Diff {
                change: DiffChangeKind::Added,
                old_path: None,
                new_path: Some("src/auth.rs".to_string()),
                old_content: None,
                new_content: Some("fn login() {}".to_string()),
                content_omitted: false,
                additions: Some(10),
                deletions: None,
            },
            Diff {
                change: DiffChangeKind::Modified,
                old_path: Some("src/main.rs".to_string()),
                new_path: Some("src/main.rs".to_string()),
                old_content: Some("old content".to_string()),
                new_content: Some("new content".to_string()),
                content_omitted: false,
                additions: Some(5),
                deletions: Some(3),
            },
            Diff {
                change: DiffChangeKind::Deleted,
                old_path: Some("src/old_module.rs".to_string()),
                new_path: None,
                old_content: Some("old module".to_string()),
                new_content: None,
                content_omitted: false,
                additions: None,
                deletions: Some(15),
            }
        ];

        let summary = service.summarize_diffs(&diffs);

        assert!(summary.contains("added src/auth.rs"));
        assert!(summary.contains("modified src/main.rs"));
        assert!(summary.contains("deleted src/old_module.rs"));
    }

    #[test]
    fn test_build_prompt() {
        let service = CommitMessageService::new();

        let prompt = service.build_prompt(
            "Add user authentication",
            Some("Basic login system"),
            "- added src/auth.rs\n- modified src/main.rs"
        );

        assert!(prompt.contains("Add user authentication"));
        assert!(prompt.contains("Basic login system"));
        assert!(prompt.contains("added src/auth.rs"));
        assert!(prompt.contains("conventional commit"));
        assert!(prompt.contains("imperative mood"));
    }

    #[test]
    fn test_build_prompt_without_description() {
        let service = CommitMessageService::new();

        let prompt = service.build_prompt(
            "Fix parsing bug",
            None,
            "- modified src/parser.rs"
        );

        assert!(prompt.contains("Fix parsing bug"));
        assert!(prompt.contains("modified src/parser.rs"));
        assert!(!prompt.contains("Description:"));
    }

    #[test]
    fn test_config_from_env_no_keys() {
        // Clear environment variables
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let config = CommitMessageConfig::from_env();
        assert!(config.is_none());
    }

    #[test]
    fn test_config_from_env_anthropic() {
        std::env::set_var("ANTHROPIC_API_KEY", "test-key");
        std::env::remove_var("OPENAI_API_KEY");

        let config = CommitMessageConfig::from_env();
        assert!(config.is_some());

        let config = config.unwrap();
        assert!(matches!(config.provider, LlmProvider::Anthropic));
        assert_eq!(config.api_key, "test-key");
        assert_eq!(config.model, "claude-3-haiku-20240307");

        std::env::remove_var("ANTHROPIC_API_KEY");
    }

    #[test]
    fn test_config_from_env_openai() {
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::set_var("OPENAI_API_KEY", "test-openai-key");

        let config = CommitMessageConfig::from_env();
        assert!(config.is_some());

        let config = config.unwrap();
        assert!(matches!(config.provider, LlmProvider::OpenAI));
        assert_eq!(config.api_key, "test-openai-key");
        assert_eq!(config.model, "gpt-4o-mini");

        std::env::remove_var("OPENAI_API_KEY");
    }

    #[test]
    fn test_config_prefers_anthropic() {
        std::env::set_var("ANTHROPIC_API_KEY", "anthropic-key");
        std::env::set_var("OPENAI_API_KEY", "openai-key");

        let config = CommitMessageConfig::from_env();
        assert!(config.is_some());

        let config = config.unwrap();
        assert!(matches!(config.provider, LlmProvider::Anthropic));
        assert_eq!(config.api_key, "anthropic-key");

        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");
    }
}