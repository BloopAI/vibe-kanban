use std::time::Duration;

use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;

use crate::services::git::GitService;
use utils::diff::Diff;

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