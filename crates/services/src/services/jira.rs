use db::models::jira_cache::{JiraCacheError, JiraCacheRepo};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use ts_rs::TS;

/// Timeout for Claude CLI command execution
const CLAUDE_TIMEOUT_SECS: u64 = 30;

/// Cache key for the user's assigned issues
const CACHE_KEY_MY_ISSUES: &str = "my_issues";

/// A Jira issue returned from Claude MCP
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct JiraIssue {
    /// Issue key (e.g., "PROJ-123")
    pub key: String,
    /// Issue summary/title
    pub summary: String,
    /// Current status (e.g., "In Progress", "To Do")
    pub status: String,
    /// Issue type (e.g., "Story", "Bug", "Task") - optional since MCP may not return it
    #[serde(default)]
    pub issue_type: Option<String>,
    /// Priority level (e.g., "High", "Medium", "Low")
    #[serde(default)]
    pub priority: Option<String>,
    /// Direct URL to the issue in Jira
    #[serde(default)]
    pub url: Option<String>,
    /// Full description/details of the ticket
    #[serde(default)]
    pub description: Option<String>,
}

/// Response containing a list of Jira issues
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct JiraIssuesResponse {
    pub issues: Vec<JiraIssue>,
    pub total: usize,
}

/// Errors that can occur when fetching Jira issues
#[derive(Debug, thiserror::Error)]
pub enum JiraError {
    #[error("Claude MCP not configured: {0}")]
    NotConfigured(String),

    #[error("Failed to execute Claude CLI: {0}")]
    ExecutionError(String),

    #[error("Failed to parse response: {0}")]
    ParseError(String),

    #[error("Claude returned an error: {0}")]
    ClaudeError(String),

    #[error("Request timed out after {0} seconds")]
    Timeout(u64),

    #[error("Cache error: {0}")]
    CacheError(#[from] JiraCacheError),
}

pub struct JiraService;

impl JiraService {
    /// Fetch assigned Jira issues with caching (5-minute TTL)
    ///
    /// Returns cached data if available and valid, otherwise fetches fresh data
    /// from Claude MCP and caches it.
    pub async fn fetch_my_issues(pool: &SqlitePool) -> Result<JiraIssuesResponse, JiraError> {
        // Check cache first
        if let Some(cached) =
            JiraCacheRepo::get::<JiraIssuesResponse>(pool, CACHE_KEY_MY_ISSUES).await?
        {
            tracing::info!(
                "Returning {} cached Jira issues (TTL: {}s remaining)",
                cached.data.total,
                cached.remaining_ttl_secs()
            );
            return Ok(cached.data);
        }

        // Cache miss - fetch fresh data
        tracing::info!("Cache miss - fetching Jira issues via Claude MCP");
        let response = Self::fetch_from_claude_mcp().await?;

        // Store in cache
        if let Err(e) = JiraCacheRepo::set(pool, CACHE_KEY_MY_ISSUES, &response).await {
            // Log cache write error but don't fail the request
            tracing::warn!("Failed to cache Jira issues: {}", e);
        }

        Ok(response)
    }

    /// Force refresh: bypass cache and fetch fresh data from Claude MCP
    pub async fn refresh_my_issues(pool: &SqlitePool) -> Result<JiraIssuesResponse, JiraError> {
        tracing::info!("Force refreshing Jira issues via Claude MCP");

        // Invalidate existing cache
        if let Err(e) = JiraCacheRepo::delete(pool, CACHE_KEY_MY_ISSUES).await {
            tracing::warn!("Failed to invalidate Jira cache: {}", e);
        }

        // Fetch fresh data
        let response = Self::fetch_from_claude_mcp().await?;

        // Store in cache
        if let Err(e) = JiraCacheRepo::set(pool, CACHE_KEY_MY_ISSUES, &response).await {
            tracing::warn!("Failed to cache Jira issues: {}", e);
        }

        Ok(response)
    }

    /// Internal method to fetch issues from Claude MCP (no caching)
    async fn fetch_from_claude_mcp() -> Result<JiraIssuesResponse, JiraError> {
        let prompt = r#"Use the Atlassian MCP search tool to find my assigned Jira issues that are not resolved. For each issue found, also fetch the full issue details to get the description. Return ONLY a valid JSON array (no markdown, no explanation) with objects containing these exact keys: "key", "summary", "status", "url", "description". The url should be the full Jira issue URL. The description should be the full ticket description text. Example format: [{"key":"PROJ-123","summary":"Fix bug","status":"In Progress","url":"https://company.atlassian.net/browse/PROJ-123","description":"Full description text here..."}]"#;

        let command_future = Command::new("claude")
            .args([
                "-p",
                "--permission-mode",
                "bypassPermissions",
                "--output-format",
                "json",
                "--model",
                "haiku", // Use faster model for quick API calls
                prompt,
            ])
            .stdin(Stdio::null()) // Close stdin to prevent hanging
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();

        // Apply timeout to prevent hanging indefinitely
        let output = tokio::time::timeout(Duration::from_secs(CLAUDE_TIMEOUT_SECS), command_future)
            .await
            .map_err(|_| JiraError::Timeout(CLAUDE_TIMEOUT_SECS))?
            .map_err(|e| {
                JiraError::ExecutionError(format!("Failed to run claude command: {}", e))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(JiraError::ExecutionError(format!(
                "Claude command failed: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        tracing::debug!("Claude response: {}", stdout);

        // Parse the Claude JSON response
        let claude_response: ClaudeResponse = serde_json::from_str(&stdout).map_err(|e| {
            JiraError::ParseError(format!(
                "Failed to parse Claude response: {}. Raw: {}",
                e,
                stdout.chars().take(500).collect::<String>()
            ))
        })?;

        if claude_response.is_error {
            return Err(JiraError::ClaudeError(claude_response.result));
        }

        // Extract JSON array from the result text
        let result = &claude_response.result;

        // Find the JSON array in the result (might be wrapped in markdown code blocks)
        let json_str = extract_json_array(result).ok_or_else(|| {
            JiraError::ParseError(format!(
                "Could not find JSON array in response: {}",
                result.chars().take(500).collect::<String>()
            ))
        })?;

        // Parse the issues array
        let raw_issues: Vec<RawJiraIssue> = serde_json::from_str(&json_str).map_err(|e| {
            JiraError::ParseError(format!("Failed to parse issues JSON: {}. JSON: {}", e, json_str))
        })?;

        let issues: Vec<JiraIssue> = raw_issues
            .into_iter()
            .map(|raw| JiraIssue {
                key: raw.key,
                summary: raw.summary,
                status: raw.status,
                issue_type: raw.issue_type,
                priority: raw.priority,
                url: raw.url,
                description: raw.description,
            })
            .collect();

        let total = issues.len();
        tracing::info!("Successfully fetched {} Jira issues via Claude MCP", total);

        Ok(JiraIssuesResponse { issues, total })
    }
}

/// Extract a JSON array from text that might contain markdown code blocks
fn extract_json_array(text: &str) -> Option<String> {
    // Try to find JSON in markdown code block first
    if let Some(start) = text.find("```json") {
        let after_marker = &text[start + 7..];
        if let Some(end) = after_marker.find("```") {
            return Some(after_marker[..end].trim().to_string());
        }
    }

    // Try plain code block
    if let Some(start) = text.find("```\n[") {
        let after_marker = &text[start + 4..];
        if let Some(end) = after_marker.find("```") {
            return Some(after_marker[..end].trim().to_string());
        }
    }

    // Try to find raw JSON array
    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            if end > start {
                return Some(text[start..=end].to_string());
            }
        }
    }

    None
}

// Claude CLI JSON response structure
#[derive(Debug, Deserialize)]
struct ClaudeResponse {
    #[serde(default)]
    is_error: bool,
    result: String,
}

// Raw issue from Claude (flexible parsing) - uses alias for camelCase compatibility
#[derive(Debug, Deserialize)]
struct RawJiraIssue {
    key: String,
    summary: String,
    status: String,
    #[serde(default, alias = "issueType")]
    issue_type: Option<String>,
    #[serde(default)]
    priority: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_array_from_markdown_code_block() {
        let input = r#"Here's the result:
```json
[{"key": "TEST-1", "summary": "Test"}]
```
Done!"#;
        let result = extract_json_array(input);
        assert_eq!(
            result,
            Some(r#"[{"key": "TEST-1", "summary": "Test"}]"#.to_string())
        );
    }

    #[test]
    fn test_extract_json_array_from_plain_code_block() {
        let input = r#"```
[{"key": "TEST-1"}]
```"#;
        let result = extract_json_array(input);
        assert_eq!(result, Some(r#"[{"key": "TEST-1"}]"#.to_string()));
    }

    #[test]
    fn test_extract_json_array_raw() {
        let input = r#"[{"key": "TEST-1", "summary": "Test issue"}]"#;
        let result = extract_json_array(input);
        assert_eq!(result, Some(input.to_string()));
    }

    #[test]
    fn test_extract_json_array_with_surrounding_text() {
        let input = r#"The issues are: [{"key": "A-1"}] and that's all."#;
        let result = extract_json_array(input);
        assert_eq!(result, Some(r#"[{"key": "A-1"}]"#.to_string()));
    }

    #[test]
    fn test_extract_json_array_no_array() {
        let input = "No JSON here, just text.";
        let result = extract_json_array(input);
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_jira_issue() {
        let json = r#"{"key":"PROJ-123","summary":"Fix bug","status":"Open"}"#;
        let issue: RawJiraIssue = serde_json::from_str(json).unwrap();
        assert_eq!(issue.key, "PROJ-123");
        assert_eq!(issue.summary, "Fix bug");
        assert_eq!(issue.status, "Open");
        assert!(issue.description.is_none());
    }

    #[test]
    fn test_parse_jira_issue_with_all_fields() {
        let json = r#"{
            "key": "PROJ-456",
            "summary": "Add feature",
            "status": "In Progress",
            "issueType": "Story",
            "priority": "High",
            "url": "https://example.atlassian.net/browse/PROJ-456",
            "description": "Full description here"
        }"#;
        let issue: RawJiraIssue = serde_json::from_str(json).unwrap();
        assert_eq!(issue.key, "PROJ-456");
        assert_eq!(issue.issue_type, Some("Story".to_string()));
        assert_eq!(issue.priority, Some("High".to_string()));
        assert_eq!(issue.description, Some("Full description here".to_string()));
    }
}
