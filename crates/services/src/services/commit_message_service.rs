use std::path::Path;

use thiserror::Error;

use db::models::{executor_session::ExecutorSession, task_attempt::TaskAttempt};
use sqlx::SqlitePool;

#[derive(Debug, Error)]
pub enum CommitMessageError {
    #[error("Git operation failed: {0}")]
    GitError(String),
    #[error("Agent execution error: {0}")]
    AgentError(String),
}

pub struct CommitMessageService;

impl CommitMessageService {
    pub fn new() -> Self {
        Self
    }

    pub fn is_available(&self) -> bool {
        true  // Always available - uses agent or simple fallback
    }

    /// Generate commit message using the task's agent session if available, fallback to simple format
    /// This method always succeeds by falling back to simple format when agent is unavailable
    pub async fn generate_commit_message(
        &self,
        pool: &SqlitePool,
        task_attempt: &TaskAttempt,
        task_title: &str,
        task_description: Option<&str>,
    ) -> String {
        // First try to get the latest executor session for this task attempt
        if let Ok(Some(executor_session)) = ExecutorSession::find_latest_by_task_attempt_id(pool, task_attempt.id).await {
            if let Some(session_id) = &executor_session.session_id {
                tracing::info!("Found executor session {} for task attempt {}, trying agent-based commit message generation", session_id, task_attempt.id);

                // Try to generate commit message using the agent with full context
                match self.generate_with_agent(task_attempt, task_title, task_description, session_id).await {
                    Ok(message) => {
                        tracing::info!("Successfully generated commit message using agent: {}", message);
                        return message;
                    }
                    Err(err) => {
                        tracing::warn!("Agent-based generation failed: {}, falling back to simple format", err);
                    }
                }
            }
        }

        // Fallback to the simple format
        tracing::info!("Using simple fallback format for commit message");
        self.generate_fallback_message(task_title, task_description, &task_attempt.task_id.to_string())
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
            actions::{coding_agent_follow_up::CodingAgentFollowUpRequest, Executable},
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
            .map_err(|e| CommitMessageError::AgentError(format!("Invalid executor profile: {}", e)))?;

        // Create a follow-up request
        let follow_up_request = CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id: session_id.to_string(),
            executor_profile_id,
        };

        // Spawn the agent process
        let mut child = follow_up_request.spawn(worktree_path).await
            .map_err(|e| CommitMessageError::AgentError(format!("Failed to spawn agent: {}", e)))?;

        // Capture stdout
        let stdout = child.inner_mut().stdout.take().ok_or_else(|| {
            CommitMessageError::AgentError("Failed to capture agent stdout".to_string())
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
                    return Err(CommitMessageError::AgentError(
                        "Agent returned empty commit message".to_string()
                    ));
                }
            }
            Err(_) => {
                return Err(CommitMessageError::AgentError(
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
            return Err(CommitMessageError::AgentError(
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

    #[test]
    fn test_service_creation() {
        let service = CommitMessageService::new();
        // Should always be able to create service
        assert!(service.is_available());
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
}
