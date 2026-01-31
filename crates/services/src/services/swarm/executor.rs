//! Task Executor - Executes tasks in sandboxes
//!
//! Handles task execution with retry logic and result persistence.
//! Implements the TaskExecutor pattern from the original Node.js backend.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use db::models::swarm_task::SwarmTask;

use super::daytona::{CommandResult, DaytonaClient};
use super::pool::PoolManager;

/// Retry configuration for task execution
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: i32,
    pub base_delay_ms: u64,
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay_ms: 5000,
            backoff_multiplier: 2.0,
        }
    }
}

/// Result of task execution
#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub attempts: i32,
}

/// Task Executor for running tasks in sandboxes
pub struct TaskExecutor {
    daytona: Arc<DaytonaClient>,
    pool_manager: Arc<PoolManager>,
    retry_config: RetryConfig,
    anthropic_api_key: Option<String>,
    skills_path: String,
}

impl TaskExecutor {
    /// Create a new TaskExecutor
    pub fn new(
        daytona: Arc<DaytonaClient>,
        pool_manager: Arc<PoolManager>,
        anthropic_api_key: Option<String>,
        skills_path: String,
    ) -> Self {
        Self {
            daytona,
            pool_manager,
            retry_config: RetryConfig::default(),
            anthropic_api_key,
            skills_path,
        }
    }

    /// Set custom retry configuration
    pub fn with_retry_config(mut self, config: RetryConfig) -> Self {
        self.retry_config = config;
        self
    }

    /// Execute a task in a sandbox with retry logic
    pub async fn execute(
        &self,
        swarm_id: Uuid,
        task: &SwarmTask,
        daytona_sandbox_id: &str,
        initial_attempt: i32,
        max_retries: i32,
        timeout_minutes: i32,
    ) -> Result<ExecutionResult> {
        let start_time = std::time::Instant::now();
        let mut attempt = initial_attempt;

        // Build environment variables for Claude credentials (passed securely, not written to disk)
        let env_vars = self.anthropic_api_key.as_ref().map(|api_key| {
            HashMap::from([
                ("ANTHROPIC_API_KEY".to_string(), api_key.clone()),
                ("CLAUDE_CODE_API_KEY".to_string(), api_key.clone()),
            ])
        });

        // Build execution prompt
        let prompt = self.build_task_prompt(task, "/workspace");
        let timeout_secs = (timeout_minutes * 60) as u64;

        loop {
            info!(
                swarm_id = %swarm_id,
                task_id = %task.id,
                daytona_sandbox_id = %daytona_sandbox_id,
                attempt = attempt,
                "Starting task execution"
            );

            // Execute Claude Code with env vars passed securely (not written to filesystem)
            let result = self
                .run_claude_code(daytona_sandbox_id, &prompt, Some("/workspace"), Some(timeout_secs), env_vars.clone())
                .await;

            let duration_ms = start_time.elapsed().as_millis() as u64;

            match result {
                Ok(exec_result) if exec_result.success => {
                    info!(
                        task_id = %task.id,
                        duration_ms = duration_ms,
                        "Task completed successfully"
                    );

                    return Ok(ExecutionResult {
                        success: true,
                        output: exec_result.output,
                        error: None,
                        duration_ms,
                        attempts: attempt,
                    });
                }
                Ok(exec_result) => {
                    let error_msg = if exec_result.error.is_empty() {
                        "Unknown error".to_string()
                    } else {
                        exec_result.error.clone()
                    };

                    warn!(
                        task_id = %task.id,
                        attempt = attempt,
                        error = %error_msg,
                        "Task execution returned error"
                    );

                    // Check if we should retry
                    if attempt < max_retries {
                        let delay = self.calculate_retry_delay(attempt);
                        info!(
                            task_id = %task.id,
                            next_attempt = attempt + 1,
                            delay_ms = delay,
                            "Will retry task"
                        );

                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        attempt += 1;
                        continue;
                    }

                    error!(
                        task_id = %task.id,
                        attempts = attempt,
                        "Task failed after max retries"
                    );

                    return Ok(ExecutionResult {
                        success: false,
                        output: exec_result.output,
                        error: Some(error_msg),
                        duration_ms,
                        attempts: attempt,
                    });
                }
                Err(e) => {
                    error!(
                        task_id = %task.id,
                        attempt = attempt,
                        error = %e,
                        "Task execution error"
                    );

                    // Check if we should retry on errors
                    if attempt < max_retries {
                        let delay = self.calculate_retry_delay(attempt);
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        attempt += 1;
                        continue;
                    }

                    return Err(e);
                }
            }
        }
    }

    /// Run Claude Code CLI in sandbox with environment variables passed securely
    /// Note: Credentials are passed via env vars, NOT written to filesystem
    async fn run_claude_code(
        &self,
        sandbox_id: &str,
        prompt: &str,
        cwd: Option<&str>,
        timeout_secs: Option<u64>,
        env_vars: Option<HashMap<String, String>>,
    ) -> Result<CommandResult> {
        // Write prompt to file (this is safe - no secrets in prompt)
        let prompt_path = "/tmp/claude_prompt.md";
        self.daytona
            .write_file(sandbox_id, prompt_path, prompt)
            .await
            .map_err(|e| anyhow!("Failed to write prompt: {}", e))?;

        // Build command - no longer sources .env file since credentials are passed via env vars
        let cmd = format!(
            "claude --yes --print \"$(cat {})\"",
            prompt_path
        );

        // Execute with env vars passed inline (secure - not written to disk)
        let result = self
            .daytona
            .execute_command_with_env(
                sandbox_id,
                &cmd,
                cwd,
                timeout_secs.map(|s| s as u32),
                env_vars,
            )
            .await
            .map_err(|e| anyhow!("Command execution failed: {}", e))?;

        Ok(result)
    }

    /// Build the task prompt for Claude Code
    fn build_task_prompt(&self, task: &SwarmTask, workspace_path: &str) -> String {
        // Extract skill and CLI from description
        let skill_name = extract_skill_name(task.description.as_deref());
        let required_clis = extract_cli_names(task.description.as_deref());

        // Clean description
        let description = task
            .description
            .as_deref()
            .map(clean_description)
            .unwrap_or_default();

        let mut prompt = String::new();

        // Agent identity
        prompt.push_str("# Agent: Worker\n\n");

        // Task header
        prompt.push_str(&format!(
            "## Task: {}\n\
             Priority: {} | Tags: {}\n\
             Workspace: {}\n\
             Mode: TASK EXECUTION - Complete autonomously\n\n",
            task.title,
            task.priority,
            task.tags.join(", "),
            workspace_path
        ));

        // Description section
        if !description.is_empty() {
            prompt.push_str(&format!("### Details\n{}\n\n", description));
        }

        // Environment setup
        prompt.push_str(&format!(
            "## Setup\n\
             **Tools:** Node.js 22, Python 3, Git, curl, jq. Standard dev environment.\n\
             **Skills:** `ls {}/` | **CLIs:** `ls /data/.claude/cli/`\n\
             **Note:** API credentials are automatically available in environment.\n\n",
            self.skills_path
        ));

        // Skill loading
        if let Some(skill) = skill_name {
            prompt.push_str(&format!(
                "### Load Skill: {}\n\
                 ```bash\n\
                 cat {}/{}/SKILL.md\n\
                 ```\n\
                 Follow the skill instructions carefully.\n\n",
                skill, self.skills_path, skill
            ));
        }

        // CLI loading (for non-secret CLI configs only)
        if !required_clis.is_empty() {
            prompt.push_str(&format!(
                "### Available CLIs: {}\n\
                 Check CLI documentation at `/data/.claude/cli/<cli-name>/` for usage.\n\n",
                required_clis.join(", ")
            ));
        }

        // Thinking framework
        prompt.push_str(
            "## Think First\n\
             1. **SUCCESS**: What defines \"done\" for this task?\n\
             2. **STEPS**: What sequence achieves this?\n\
             3. **RISKS**: What could fail? How to handle?\n\n",
        );

        // Execution instructions
        prompt.push_str(
            "## Execute\n\
             - Complete autonomously - proceed with reasonable assumptions\n\
             - Make reasonable assumptions, note them in output\n\
             - If blocked, try alternative approach before reporting failure\n\n",
        );

        // Output rules
        prompt.push_str(
            "## Output Rules\n\
             **ALWAYS filter outputs to save context:**\n\
             - `command | head -20` or `| tail -20` for long outputs\n\
             - `curl ... | jq '.field'` to extract specific data\n\
             - **Max 50 lines** per command output\n\
             - Summarize all results concisely\n\n\
             **Response format:**\n\
             - SUMMARY: 1-2 sentences of what was done\n\
             - FILES: Created/modified paths (if any)\n\
             - ISSUES: Problems encountered (if any)\n\
             - NEXT: Suggested follow-up (if applicable)\n",
        );

        prompt
    }

    /// Calculate retry delay with exponential backoff
    fn calculate_retry_delay(&self, attempt: i32) -> u64 {
        let base = self.retry_config.base_delay_ms as f64;
        let multiplier = self.retry_config.backoff_multiplier;
        (base * multiplier.powi(attempt - 1)) as u64
    }
}

// Static regex patterns compiled once for performance
static SKILL_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?im)^SKILL:\s*([^\n]+)").expect("Invalid SKILL regex"));
static CLI_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?im)^CLI:\s*([^\n]+)").expect("Invalid CLI regex"));
static SKILL_CLEAN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?im)^SKILL:\s*[^\n]+\n*").expect("Invalid SKILL_CLEAN regex"));
static CLI_CLEAN_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?im)^CLI:\s*[^\n]+\n*").expect("Invalid CLI_CLEAN regex"));

/// Extract skill name from task description
fn extract_skill_name(description: Option<&str>) -> Option<String> {
    description.and_then(|desc| {
        SKILL_REGEX
            .captures(desc)
            .and_then(|caps| caps.get(1))
            .map(|m| m.as_str().trim().to_string())
    })
}

/// Extract CLI names from task description
fn extract_cli_names(description: Option<&str>) -> Vec<String> {
    description
        .and_then(|desc| {
            CLI_REGEX
                .captures(desc)
                .and_then(|caps| caps.get(1))
                .map(|m| {
                    m.as_str()
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect()
                })
        })
        .unwrap_or_default()
}

/// Clean description by removing SKILL: and CLI: prefixes
fn clean_description(description: &str) -> String {
    let cleaned = SKILL_CLEAN_REGEX.replace_all(description, "");
    let cleaned = CLI_CLEAN_REGEX.replace_all(&cleaned, "");

    cleaned.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_skill_name() {
        let desc = "SKILL: backend-developer\nCLI: stripe-cli\n\nBuild an API";
        assert_eq!(
            extract_skill_name(Some(desc)),
            Some("backend-developer".to_string())
        );

        let desc_no_skill = "Just a simple task";
        assert_eq!(extract_skill_name(Some(desc_no_skill)), None);
    }

    #[test]
    fn test_extract_cli_names() {
        let desc = "SKILL: backend\nCLI: stripe-cli, vercel\n\nDeploy app";
        let clis = extract_cli_names(Some(desc));
        assert_eq!(clis, vec!["stripe-cli".to_string(), "vercel".to_string()]);
    }

    #[test]
    fn test_clean_description() {
        let desc = "SKILL: test\nCLI: foo\n\nActual description here";
        assert_eq!(clean_description(desc), "Actual description here");
    }
}
