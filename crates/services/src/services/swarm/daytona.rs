//! Daytona HTTP Client for sandbox management.
//!
//! Provides a Rust implementation of the Daytona API client for:
//! - Creating and managing sandboxes
//! - Executing commands in sandboxes
//! - Streaming logs via WebSocket/SSE
//! - Managing sandbox lifecycle

use std::collections::HashMap;
use std::time::Duration;

use regex::Regex;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, error, info, warn};
use shlex;
use url::Url;

// ============================================================================
// Security Utilities
// ============================================================================

/// List of environment variable name patterns that contain sensitive values
const SENSITIVE_ENV_PATTERNS: &[&str] = &[
    "API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_API_KEY",
    "SECRET",
    "PASSWORD",
    "TOKEN",
    "CREDENTIAL",
    "AUTH",
    "PRIVATE_KEY",
    "ACCESS_KEY",
    "OPENAI_API_KEY",
];

/// Masks sensitive values in a command string that may contain environment variables.
/// Prevents API keys and secrets from being exposed in logs.
///
/// E.g., "ANTHROPIC_API_KEY=sk-ant-123 command" -> "ANTHROPIC_API_KEY=*** command"
fn mask_sensitive_command(command: &str) -> String {
    let mut masked = command.to_string();

    for sensitive_pattern in SENSITIVE_ENV_PATTERNS {
        let escaped = regex::escape(sensitive_pattern);

        // Match patterns like KEY=value or KEY='value' or KEY="value"
        // Pattern 1: KEY=unquoted_value (stops at space)
        let pattern1 = format!(r#"(?i)({}[A-Z_]*=)([^\s'"]+)"#, escaped);
        // Pattern 2: KEY='quoted_value'
        let pattern2 = format!(r#"(?i)({}[A-Z_]*=)'([^']*)'"#, escaped);
        // Pattern 3: KEY="quoted_value"
        let pattern3 = format!(r#"(?i)({}[A-Z_]*=)"([^"]*)""#, escaped);

        for pattern in [&pattern1, &pattern2, &pattern3] {
            if let Ok(re) = Regex::new(pattern) {
                masked = re.replace_all(&masked, "${1}***").to_string();
            }
        }
    }

    masked
}

/// Masks sensitive values in a HashMap of environment variables for safe logging.
/// Returns a new HashMap with sensitive values replaced by "***".
#[allow(dead_code)]
fn mask_sensitive_env_vars(env: &HashMap<String, String>) -> HashMap<String, String> {
    env.iter()
        .map(|(k, v)| {
            let is_sensitive = SENSITIVE_ENV_PATTERNS.iter().any(|pattern| {
                k.to_uppercase().contains(&pattern.to_uppercase())
            });

            if is_sensitive {
                (k.clone(), "***".to_string())
            } else {
                (k.clone(), v.clone())
            }
        })
        .collect()
}

// ============================================================================
// Error Types
// ============================================================================

/// Errors that can occur when interacting with the Daytona API.
#[derive(Debug, Error)]
pub enum DaytonaError {
    #[error("network error: {0}")]
    Transport(String),

    #[error("request timed out after {0}ms")]
    Timeout(u64),

    #[error("HTTP {status}: {body}")]
    Http { status: u16, body: String },

    #[error("sandbox not found: {0}")]
    SandboxNotFound(String),

    #[error("command execution failed: {0}")]
    CommandFailed(String),

    #[error("JSON error: {0}")]
    Json(String),

    #[error("invalid URL: {0}")]
    Url(String),

    #[error("authentication failed")]
    Auth,

    #[error("configuration error: {0}")]
    Config(String),

    #[error("command rejected: {0}")]
    CommandRejected(String),
}

impl DaytonaError {
    pub fn should_retry(&self) -> bool {
        match self {
            Self::Transport(_) | Self::Timeout(_) => true,
            Self::Http { status, .. } => (500..=599).contains(status),
            _ => false,
        }
    }
}

// ============================================================================
// API Types - Request/Response
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandboxRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_stop_interval: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk: Option<u32>,
}

impl Default for CreateSandboxRequest {
    fn default() -> Self {
        Self {
            name: None,
            snapshot: Some("swarm-lite-v1".to_string()),
            env: None,
            auto_stop_interval: Some(60),
            target: Some("us".to_string()),
            cpu: None,
            memory: None,
            disk: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandboxResponse {
    pub id: String,
    #[serde(default)]
    pub state: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sandbox {
    pub id: String,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub snapshot: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCommandRequest {
    pub command: String,
    #[serde(default = "default_cwd")]
    pub cwd: String,
    #[serde(default = "default_timeout")]
    pub timeout: u32,
}

fn default_cwd() -> String {
    "/home/daytona".to_string()
}

fn default_timeout() -> u32 {
    60
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCommandResponse {
    pub exit_code: i32,
    #[serde(default)]
    pub result: Option<String>,
    #[serde(default)]
    pub stderr: Option<String>,
    #[serde(default)]
    pub artifacts: Option<CommandArtifacts>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandArtifacts {
    #[serde(default)]
    pub stdout: Option<String>,
    #[serde(default)]
    pub stderr: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: String,
    pub exit_code: i32,
}

impl From<ExecuteCommandResponse> for CommandResult {
    fn from(resp: ExecuteCommandResponse) -> Self {
        let output = resp
            .result
            .or_else(|| resp.artifacts.as_ref().and_then(|a| a.stdout.clone()))
            .unwrap_or_default();

        let error = resp
            .stderr
            .or_else(|| resp.artifacts.as_ref().and_then(|a| a.stderr.clone()))
            .unwrap_or_default();

        Self {
            success: resp.exit_code == 0,
            output,
            error,
            exit_code: resp.exit_code,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewUrlResponse {
    pub url: String,
    pub port: u16,
}

// ============================================================================
// Daytona Client
// ============================================================================

#[derive(Debug, Clone)]
pub struct DaytonaConfig {
    pub api_url: String,
    pub api_key: String,
    pub default_snapshot: Option<String>,
    pub timeout_ms: u64,
    pub target: Option<String>,
}

impl Default for DaytonaConfig {
    fn default() -> Self {
        Self {
            api_url: "https://api.daytona.io".to_string(),
            api_key: String::new(),
            default_snapshot: Some("swarm-lite-v1".to_string()),
            timeout_ms: 30_000,
            target: Some("us".to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DaytonaClient {
    base: Url,
    http: Client,
    config: DaytonaConfig,
}

impl DaytonaClient {
    pub fn new(config: DaytonaConfig) -> Result<Self, DaytonaError> {
        let base = Url::parse(&config.api_url).map_err(|e| DaytonaError::Url(e.to_string()))?;

        let http = Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms))
            .user_agent("daytona-client-rust/0.1.0")
            .build()
            .map_err(|e| DaytonaError::Transport(e.to_string()))?;

        info!(api_url = %config.api_url, "Daytona client initialized");

        Ok(Self { base, http, config })
    }

    pub fn from_env() -> Result<Self, DaytonaError> {
        let api_url = std::env::var("DAYTONA_API_URL")
            .or_else(|_| std::env::var("DAYTONA_URL"))
            .map_err(|_| DaytonaError::Config("DAYTONA_API_URL not set".to_string()))?;

        let api_key = std::env::var("DAYTONA_API_KEY")
            .or_else(|_| std::env::var("DAYTONA_KEY"))
            .map_err(|_| DaytonaError::Config("DAYTONA_API_KEY not set".to_string()))?;

        Self::new(DaytonaConfig {
            api_url,
            api_key,
            ..Default::default()
        })
    }

    // Core HTTP Methods

    async fn send<B>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<&B>,
    ) -> Result<reqwest::Response, DaytonaError>
    where
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| DaytonaError::Url(e.to_string()))?;

        let timeout_ms = self.config.timeout_ms;

        let mut req = self
            .http
            .request(method.clone(), url.clone())
            .bearer_auth(&self.config.api_key);

        if let Some(b) = body {
            req = req.json(b);
        }

        let res = req.send().await.map_err(|e| {
            if e.is_timeout() {
                DaytonaError::Timeout(timeout_ms)
            } else {
                DaytonaError::Transport(e.to_string())
            }
        })?;

        match res.status() {
            s if s.is_success() => Ok(res),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(DaytonaError::Auth),
            StatusCode::NOT_FOUND => Err(DaytonaError::SandboxNotFound(url.path().to_string())),
            s => {
                let status = s.as_u16();
                let body = res.text().await.unwrap_or_default();
                Err(DaytonaError::Http { status, body })
            }
        }
    }

    async fn get<T>(&self, path: &str) -> Result<T, DaytonaError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let res = self.send(reqwest::Method::GET, path, None::<&()>).await?;
        res.json::<T>()
            .await
            .map_err(|e| DaytonaError::Json(e.to_string()))
    }

    async fn post<T, B>(&self, path: &str, body: &B) -> Result<T, DaytonaError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let res = self.send(reqwest::Method::POST, path, Some(body)).await?;
        res.json::<T>()
            .await
            .map_err(|e| DaytonaError::Json(e.to_string()))
    }

    async fn delete(&self, path: &str) -> Result<(), DaytonaError> {
        self.send(reqwest::Method::DELETE, path, None::<&()>).await?;
        Ok(())
    }

    // Sandbox Management

    pub async fn create_sandbox(
        &self,
        request: CreateSandboxRequest,
    ) -> Result<Sandbox, DaytonaError> {
        info!(
            name = ?request.name,
            snapshot = ?request.snapshot,
            "Creating sandbox"
        );

        let response: CreateSandboxResponse = self.post("/api/sandbox", &request).await?;

        info!(sandbox_id = %response.id, "Sandbox created");

        self.get_sandbox(&response.id).await
    }

    pub async fn create_sandbox_from_snapshot(
        &self,
        name: Option<String>,
    ) -> Result<Sandbox, DaytonaError> {
        let request = CreateSandboxRequest {
            name,
            snapshot: self.config.default_snapshot.clone(),
            target: self.config.target.clone(),
            ..Default::default()
        };
        self.create_sandbox(request).await
    }

    pub async fn get_sandbox(&self, sandbox_id: &str) -> Result<Sandbox, DaytonaError> {
        self.get(&format!("/api/sandbox/{}", sandbox_id)).await
    }

    pub async fn list_sandboxes(&self) -> Result<Vec<Sandbox>, DaytonaError> {
        self.get("/api/sandbox").await
    }

    pub async fn delete_sandbox(&self, sandbox_id: &str) -> Result<(), DaytonaError> {
        info!(sandbox_id = %sandbox_id, "Deleting sandbox");
        self.delete(&format!("/api/sandbox/{}", sandbox_id)).await?;
        info!(sandbox_id = %sandbox_id, "Sandbox deleted");
        Ok(())
    }

    pub async fn stop_sandbox(&self, sandbox_id: &str) -> Result<(), DaytonaError> {
        info!(sandbox_id = %sandbox_id, "Stopping sandbox");
        self.post::<serde_json::Value, _>(
            &format!("/api/sandbox/{}/stop", sandbox_id),
            &serde_json::json!({}),
        )
        .await?;
        Ok(())
    }

    pub async fn start_sandbox(&self, sandbox_id: &str) -> Result<(), DaytonaError> {
        info!(sandbox_id = %sandbox_id, "Starting sandbox");
        self.post::<serde_json::Value, _>(
            &format!("/api/sandbox/{}/start", sandbox_id),
            &serde_json::json!({}),
        )
        .await?;
        Ok(())
    }

    // Command Execution

    pub async fn execute_command(
        &self,
        sandbox_id: &str,
        command: &str,
        cwd: Option<&str>,
        timeout: Option<u32>,
    ) -> Result<CommandResult, DaytonaError> {
        // SECURITY: Mask sensitive values (API keys, secrets) before logging
        let safe_command = mask_sensitive_command(command);
        debug!(
            sandbox_id = %sandbox_id,
            command = %safe_command,
            "Executing command"
        );

        // Security: Use shlex to properly escape commands to prevent command injection
        let final_command = if command.contains('|')
            || command.contains("&&")
            || command.contains("||")
            || command.contains(';')
            || command.contains('`')
            || command.contains("$(")
        {
            // Use shlex::try_quote for safe shell escaping
            match shlex::try_quote(command) {
                Ok(quoted) => format!("bash -c {}", quoted),
                Err(e) => {
                    // SECURITY: Never fall back to unsanitized command - this could allow command injection
                    // Note: Using safe_command in log to prevent leaking secrets
                    error!(
                        sandbox_id = %sandbox_id,
                        command = %safe_command,
                        error = %e,
                        "Command rejected: shlex quoting failed. Command contains characters that cannot be safely escaped."
                    );
                    return Err(DaytonaError::CommandRejected(format!(
                        "Command contains unsafe characters that cannot be properly escaped: {}",
                        e
                    )));
                }
            }
        } else {
            command.to_string()
        };

        let request = ExecuteCommandRequest {
            command: final_command,
            cwd: cwd.unwrap_or("/home/daytona").to_string(),
            timeout: timeout.unwrap_or(60),
        };

        let response: ExecuteCommandResponse = self
            .post(
                &format!("/api/toolbox/{}/toolbox/process/execute", sandbox_id),
                &request,
            )
            .await?;

        let result = CommandResult::from(response);

        debug!(
            sandbox_id = %sandbox_id,
            success = result.success,
            exit_code = result.exit_code,
            "Command completed"
        );

        Ok(result)
    }

    pub async fn execute_command_with_timeout(
        &self,
        sandbox_id: &str,
        command: &str,
        timeout_ms: u64,
    ) -> Result<CommandResult, DaytonaError> {
        let timeout_secs = (timeout_ms / 1000) as u32;
        self.execute_command(sandbox_id, command, None, Some(timeout_secs))
            .await
    }

    /// Execute a command with environment variables passed inline (not written to filesystem)
    /// This is the secure way to pass secrets - they exist only in memory during execution
    pub async fn execute_command_with_env(
        &self,
        sandbox_id: &str,
        command: &str,
        cwd: Option<&str>,
        timeout: Option<u32>,
        env: Option<HashMap<String, String>>,
    ) -> Result<CommandResult, DaytonaError> {
        // Build environment prefix for inline variable injection
        let env_prefix = env
            .map(|vars| {
                vars.iter()
                    .map(|(k, v)| {
                        // Use shlex to safely quote the value
                        let quoted_value = shlex::try_quote(v).unwrap_or_else(|_| v.into());
                        format!("{}={}", k, quoted_value)
                    })
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();

        let full_command = if env_prefix.is_empty() {
            command.to_string()
        } else {
            format!("{} {}", env_prefix, command)
        };

        self.execute_command(sandbox_id, &full_command, cwd, timeout)
            .await
    }

    // File Operations

    pub async fn write_file(
        &self,
        sandbox_id: &str,
        path: &str,
        content: &str,
    ) -> Result<(), DaytonaError> {
        let request = WriteFileRequest {
            path: path.to_string(),
            content: content.to_string(),
        };

        self.post::<serde_json::Value, _>(
            &format!("/api/toolbox/{}/toolbox/fs/write", sandbox_id),
            &request,
        )
        .await?;

        Ok(())
    }

    pub async fn read_file(&self, sandbox_id: &str, path: &str) -> Result<String, DaytonaError> {
        let response: serde_json::Value = self
            .get(&format!(
                "/api/toolbox/{}/toolbox/fs/read?path={}",
                sandbox_id,
                urlencoding::encode(path)
            ))
            .await?;

        response
            .get("content")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| DaytonaError::Json("Missing content field".to_string()))
    }

    pub async fn list_files(
        &self,
        sandbox_id: &str,
        path: &str,
    ) -> Result<Vec<String>, DaytonaError> {
        let response: serde_json::Value = self
            .get(&format!(
                "/api/toolbox/{}/toolbox/fs/list?path={}",
                sandbox_id,
                urlencoding::encode(path)
            ))
            .await?;

        response
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.get("name").and_then(|n| n.as_str()))
                    .map(|s| s.to_string())
                    .collect()
            })
            .ok_or_else(|| DaytonaError::Json("Invalid file list response".to_string()))
    }

    // Preview/Port Exposure

    pub async fn get_preview_url(
        &self,
        sandbox_id: &str,
        port: u16,
    ) -> Result<String, DaytonaError> {
        match self
            .get::<PreviewUrlResponse>(&format!("/api/sandbox/{}/preview/{}", sandbox_id, port))
            .await
        {
            Ok(response) => Ok(response.url),
            Err(_) => Ok(format!("https://{}-{}.daytona.io", sandbox_id, port)),
        }
    }

    // Health Check

    pub async fn health_check(&self) -> Result<bool, DaytonaError> {
        match self.get::<serde_json::Value>("/api/health").await {
            Ok(_) => Ok(true),
            Err(DaytonaError::Http { status, .. }) if status < 500 => Ok(true),
            Err(e) => Err(e),
        }
    }

    pub fn base_url(&self) -> &str {
        self.base.as_str()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_sensitive_command_api_key() {
        let cmd = "ANTHROPIC_API_KEY=sk-ant-api03-secret123 claude --print 'hello'";
        let masked = mask_sensitive_command(cmd);
        assert_eq!(masked, "ANTHROPIC_API_KEY=*** claude --print 'hello'");
        assert!(!masked.contains("sk-ant"));
    }

    #[test]
    fn test_mask_sensitive_command_multiple_keys() {
        let cmd = "ANTHROPIC_API_KEY=secret1 OPENAI_API_KEY=secret2 python script.py";
        let masked = mask_sensitive_command(cmd);
        assert!(!masked.contains("secret1"));
        assert!(!masked.contains("secret2"));
        assert!(masked.contains("ANTHROPIC_API_KEY=***"));
        assert!(masked.contains("OPENAI_API_KEY=***"));
    }

    #[test]
    fn test_mask_sensitive_command_quoted_values() {
        let cmd = r#"API_KEY="my-secret-key" OTHER='another-secret' run"#;
        let masked = mask_sensitive_command(cmd);
        assert!(!masked.contains("my-secret-key"));
        assert!(!masked.contains("another-secret"));
    }

    #[test]
    fn test_mask_sensitive_command_preserves_non_sensitive() {
        let cmd = "PATH=/usr/bin NODE_ENV=production python script.py";
        let masked = mask_sensitive_command(cmd);
        assert_eq!(masked, cmd);
    }

    #[test]
    fn test_mask_sensitive_command_password() {
        let cmd = "DATABASE_PASSWORD=super_secret_pass123 psql";
        let masked = mask_sensitive_command(cmd);
        assert!(!masked.contains("super_secret_pass123"));
        assert!(masked.contains("PASSWORD=***"));
    }

    #[test]
    fn test_mask_sensitive_env_vars() {
        let mut env = HashMap::new();
        env.insert("ANTHROPIC_API_KEY".to_string(), "sk-ant-secret".to_string());
        env.insert("PATH".to_string(), "/usr/bin".to_string());
        env.insert("SECRET_TOKEN".to_string(), "token123".to_string());

        let masked = mask_sensitive_env_vars(&env);

        assert_eq!(masked.get("ANTHROPIC_API_KEY").unwrap(), "***");
        assert_eq!(masked.get("PATH").unwrap(), "/usr/bin");
        assert_eq!(masked.get("SECRET_TOKEN").unwrap(), "***");
    }
}
