use std::{env, fs, path::PathBuf, process::Stdio, sync::Arc};

use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{StatusCode, header},
    response::{
        Json as ResponseJson, Response,
        sse::{Event, KeepAlive, KeepAliveStream, Sse},
    },
    routing::{delete, get, post},
};
use chrono::Utc;
use db::models::{
    label::TaskDependency,
    pm_conversation::{
        CreatePmAttachment, CreatePmConversation, PmAttachment, PmConversation, PmMessageRole,
    },
    project::Project,
    project_repo::ProjectRepo,
    task::Task,
};
use deployment::Deployment;
use futures::stream::BoxStream;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use strum_macros::{Display, EnumString};
use tokio::{
    fs::File,
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::Mutex,
};
use tokio_util::io::ReaderStream;
use ts_rs::TS;
use utils::{response::ApiResponse, shell::resolve_executable_path};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Available AI CLI providers for PM Chat
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS, Display, EnumString, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
#[ts(export)]
pub enum PmChatAgent {
    /// Claude CLI (claude) - Anthropic's coding assistant
    #[default]
    ClaudeCli,
    /// Codex CLI (codex) - OpenAI's coding assistant
    CodexCli,
    /// Gemini CLI (gemini) - Google's coding assistant
    GeminiCli,
    /// OpenCode CLI (opencode) - Open source coding assistant
    OpencodeCli,
}

impl PmChatAgent {
    /// Get the command name for this CLI
    pub fn command_name(&self) -> &'static str {
        match self {
            PmChatAgent::ClaudeCli => "claude",
            PmChatAgent::CodexCli => "codex",
            PmChatAgent::GeminiCli => "gemini",
            PmChatAgent::OpencodeCli => "opencode",
        }
    }

    /// Get display name for UI
    pub fn display_name(&self) -> &'static str {
        match self {
            PmChatAgent::ClaudeCli => "Claude CLI",
            PmChatAgent::CodexCli => "Codex CLI",
            PmChatAgent::GeminiCli => "Gemini CLI",
            PmChatAgent::OpencodeCli => "OpenCode CLI",
        }
    }

    /// Check if this CLI supports streaming output
    pub fn supports_streaming(&self) -> bool {
        match self {
            PmChatAgent::ClaudeCli => true,
            PmChatAgent::CodexCli => true,
            PmChatAgent::GeminiCli => true, // Gemini CLI supports --output-format stream-json
            PmChatAgent::OpencodeCli => true,
        }
    }

    /// Check if this CLI is available (installed)
    pub async fn is_available(&self) -> bool {
        resolve_executable_path(self.command_name()).await.is_some()
    }

    /// Get all available CLI agents on this system
    pub async fn available_agents() -> Vec<PmChatAgent> {
        let all_agents = vec![
            PmChatAgent::ClaudeCli,
            PmChatAgent::CodexCli,
            PmChatAgent::GeminiCli,
            PmChatAgent::OpencodeCli,
        ];

        let mut available = Vec::new();
        for agent in all_agents {
            if agent.is_available().await {
                available.push(agent);
            }
        }
        available
    }
}

/// Type alias for boxed SSE stream to unify different stream implementations
type SseStream = KeepAliveStream<BoxStream<'static, Result<Event, std::convert::Infallible>>>;

/// Request payload for sending a chat message
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SendMessageRequest {
    pub content: String,
    pub role: Option<String>, // "user", "assistant", or "system" - defaults to "user"
}

/// Request payload for AI-assisted chat
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct AiChatRequest {
    pub content: String,
    pub model: Option<String>, // e.g., "sonnet", "opus", "haiku"
    pub agent: Option<PmChatAgent>, // CLI agent to use (defaults to ClaudeCli)
}

/// Response for available PM Chat agents
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct AvailablePmChatAgentsResponse {
    pub agents: Vec<PmChatAgentInfo>,
}

/// Information about a PM Chat agent
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct PmChatAgentInfo {
    pub agent: PmChatAgent,
    pub display_name: String,
    pub available: bool,
    pub supports_streaming: bool,
}

/// SSE event data for streaming AI response
#[derive(Debug, Clone, Serialize)]
pub struct AiChatStreamEvent {
    #[serde(rename = "type")]
    pub event_type: String, // "content", "done", "error", "tool_use", "task_created", "docs_updated"
    pub content: Option<String>,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_title: Option<String>,
}

/// Response for PM chat with messages and attachments
#[derive(Debug, Clone, Serialize, TS)]
pub struct PmChatResponse {
    pub messages: Vec<PmConversation>,
    pub pm_docs: Option<String>,
}

/// Request for updating PM docs
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdatePmDocsRequest {
    pub pm_docs: Option<String>,
}

/// Get all PM chat messages for a project
pub async fn get_pm_chat(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<PmChatResponse>>, ApiError> {
    let messages = PmConversation::find_by_project_id(&deployment.db().pool, project.id).await?;

    Ok(ResponseJson(ApiResponse::success(PmChatResponse {
        messages,
        pm_docs: project.pm_docs,
    })))
}

/// Send a new message to the PM chat
pub async fn send_message(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<SendMessageRequest>,
) -> Result<ResponseJson<ApiResponse<PmConversation>>, ApiError> {
    let role = match payload.role.as_deref().unwrap_or("user") {
        "assistant" => PmMessageRole::Assistant,
        "system" => PmMessageRole::System,
        _ => PmMessageRole::User,
    };

    let create_data = CreatePmConversation {
        project_id: project.id,
        role,
        content: payload.content,
        model: None,
    };

    let message = PmConversation::create(&deployment.db().pool, &create_data).await?;

    deployment
        .track_if_analytics_allowed(
            "pm_chat_message_sent",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "message_id": message.id.to_string(),
                "role": create_data.role.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(message)))
}

/// Send a message and get an AI response using Claude CLI with MCP tools
pub async fn ai_chat(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AiChatRequest>,
) -> Result<Sse<SseStream>, ApiError> {
    // Get conversation history for context
    let messages = PmConversation::find_by_project_id(&deployment.db().pool, project.id).await?;

    // Get project labels for AI context
    let labels = db::models::label::Label::find_by_project_id(&deployment.db().pool, project.id)
        .await
        .unwrap_or_default();

    // Build system prompt with PM context
    let mut system_prompt = format!(
        r#"You are an expert Project Manager assistant for a Kanban-style project management app.

## IMPORTANT: Project Context
You are working on project_id: {}

## Your MCP Tools
You have access to vibe_kanban MCP tools for comprehensive project management:

### Task Management
- **create_task**: Create a task with ALL these parameters:
  - `project_id`: Required - the project ID
  - `title`: Clear, actionable title
  - `description`: DETAILED description including:
    - What needs to be done (具体的な作業内容)
    - Acceptance criteria (完了条件)
    - Technical approach if applicable (技術的なアプローチ)
  - `priority`: REQUIRED - 'urgent', 'high', 'medium', or 'low'
  - `depends_on`: List of task IDs this depends on
  - `label_ids`: List of matching label IDs
  - `check_duplicate: true` to avoid duplicates
- **get_project_progress**: Get completion percentage and status summary for project_id
- **list_tasks**: List all tasks in the project
- **update_task**: Update task status, title, description
- **get_task**: Get detailed task information

### Documentation
- **update_pm_docs**: Update project documentation
  - Use `mode: "append"` to add to existing docs
  - Use `mode: "replace"` to replace all docs
  - Structure docs with markdown sections: ## 仕様, ## 設計, ## メモ, etc.

### PM Context
- **get_pm_context**: Get PM specifications and guidelines
- **request_pm_review**: Generate review checklist based on PM specs

## When to Use Tools
- Before creating a task → use list_tasks to understand existing tasks and their dependencies
- When creating a task → ALWAYS use check_duplicate=true to prevent duplicates
- When creating tasks → analyze dependencies: which tasks need to be completed first?
- When creating tasks → match labels based on task type (bug, feature, design, etc.)
- When saving documentation → organize with clear markdown sections

## Dependency Analysis Guidelines
When the user wants to create multiple tasks or a task that relates to existing tasks:
1. First call list_tasks to see all existing tasks
2. Analyze which tasks logically depend on others (e.g., "implement API" before "create frontend")
3. When creating each task, set the depends_on parameter with the IDs of prerequisite tasks
4. Consider common dependency patterns:
   - Design → Implementation → Testing
   - Backend API → Frontend integration
   - Database schema → Data access layer → Business logic
   - Setup/Config → Feature development

## Label Assignment Guidelines
When creating a task, analyze its title and description to match appropriate labels.
"#,
        project.id
    );

    // Add available labels to the prompt
    if !labels.is_empty() {
        system_prompt.push_str("\n## Available Labels for This Project\n");
        for label in &labels {
            let executor_info = label.executor.as_ref()
                .map(|e| format!(" (executor: {})", e))
                .unwrap_or_default();
            system_prompt.push_str(&format!(
                "- **{}** (id: {}){}\n",
                label.name, label.id, executor_info
            ));
        }
        system_prompt.push_str("\nWhen creating tasks, match labels based on:\n");
        system_prompt.push_str("- Task type keywords (bug, fix → bug label; feature, add → feature label)\n");
        system_prompt.push_str("- Task domain (UI, frontend → frontend label; API, backend → backend label)\n");
        system_prompt.push_str("- If executor is specified for a label, consider using it for matching task types\n\n");
    }

    system_prompt.push_str(&format!(
        r#"## MANDATORY Rules for Task Creation
When creating ANY task, you MUST:
1. **priority**: ALWAYS set priority (urgent/high/medium/low) - analyze task importance
2. **description**: ALWAYS write detailed description with:
   - 作業内容: What needs to be done in detail
   - 完了条件: Clear acceptance criteria
   - 備考: Any technical notes or approach
3. **label_ids**: ALWAYS check available labels and attach matching ones
4. **depends_on**: ALWAYS analyze existing tasks and set dependencies if any

## Guidelines
- ALWAYS use project_id={} when calling tools
- ALWAYS use check_duplicate=true when creating tasks
- Before creating tasks, call list_tasks to analyze dependencies
- Match labels by keywords: bug/fix→bug, feature/add→feature, UI/画面→frontend
- Structure documentation with sections: 仕様, 設計, 議事録, etc.
- Report progress status when asked
- Use Japanese when the user writes in Japanese

"#,
        project.id
    ));

    // Add PM docs if available
    if let Some(ref docs) = project.pm_docs {
        system_prompt.push_str("## Current Project Documentation\n```\n");
        system_prompt.push_str(docs);
        system_prompt.push_str("\n```\n\n");
    }

    // Get task summary with IDs, labels, and dependencies
    let tasks_with_status =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id)
            .await
            .unwrap_or_default();

    if !tasks_with_status.is_empty() {
        system_prompt.push_str("## Current Tasks (use these IDs for depends_on)\n");
        for task_with_status in &tasks_with_status {
            let task = &task_with_status.task;

            // Get task labels
            let task_labels = db::models::label::Label::find_by_task_id(&deployment.db().pool, task.id)
                .await
                .unwrap_or_default();
            let label_names: Vec<String> = task_labels.iter()
                .map(|l| l.name.clone())
                .collect();

            // Get task dependencies
            let deps = TaskDependency::find_dependencies(&deployment.db().pool, task.id)
                .await
                .unwrap_or_default();

            // Format: - [status] title (id: xxx, priority: P, labels: [L1, L2], depends_on: [id1, id2])
            let mut task_info = format!(
                "- [{:?}] {} (id: {}, priority: {:?}",
                task.status, task.title, task.id, task.priority
            );

            if !label_names.is_empty() {
                task_info.push_str(&format!(", labels: [{}]", label_names.join(", ")));
            }

            if !deps.is_empty() {
                let dep_ids: Vec<String> = deps.iter().map(|id| id.to_string()).collect();
                task_info.push_str(&format!(", depends_on: [{}]", dep_ids.join(", ")));
            }

            task_info.push_str(")\n");
            system_prompt.push_str(&task_info);
        }
        system_prompt.push('\n');
    }

    // Add recent conversation history for context (last 10 messages)
    if !messages.is_empty() {
        system_prompt.push_str("## Recent Conversation History\n");
        let recent_messages: Vec<_> = messages.iter().rev().take(10).collect();
        for msg in recent_messages.iter().rev() {
            let role_str = match msg.role.as_str() {
                "user" => "User",
                "assistant" => "Assistant",
                "system" => "System",
                _ => "User",
            };
            // Truncate long messages to avoid context overflow (UTF-8 safe)
            let content = if msg.content.len() > 500 {
                let truncated = utils::text::truncate_to_char_boundary(&msg.content, 500);
                format!("{}...", truncated)
            } else {
                msg.content.clone()
            };
            system_prompt.push_str(&format!("**{}**: {}\n\n", role_str, content));
        }
    }

    let model_name = payload.model.clone().unwrap_or_else(|| "sonnet".to_string());
    let user_content = payload.content.clone();
    let pool = deployment.db().pool.clone();
    let project_id = project.id;
    let agent = payload.agent.unwrap_or_default();

    // Use CLI mode with MCP for reliable tool execution
    tracing::info!("Using {:?} with MCP tools for PM Chat", agent);
    create_mcp_cli_stream(agent, model_name, system_prompt, user_content, pool, project_id).await
}

/// Get available PM Chat agents
pub async fn get_available_agents() -> Result<ResponseJson<ApiResponse<AvailablePmChatAgentsResponse>>, ApiError> {
    let all_agents = vec![
        PmChatAgent::ClaudeCli,
        PmChatAgent::CodexCli,
        PmChatAgent::GeminiCli,
        PmChatAgent::OpencodeCli,
    ];

    let mut agents = Vec::new();
    for agent in all_agents {
        agents.push(PmChatAgentInfo {
            agent,
            display_name: agent.display_name().to_string(),
            available: agent.is_available().await,
            supports_streaming: agent.supports_streaming(),
        });
    }

    Ok(ResponseJson(ApiResponse::success(AvailablePmChatAgentsResponse { agents })))
}

/// Create MCP config JSON for the specified agent
/// Different CLIs have different MCP configuration formats
fn create_mcp_config_for_agent(
    agent: PmChatAgent,
    mcp_binary_path: &Option<PathBuf>,
    backend_url: &str,
) -> serde_json::Value {
    let (command, args) = if let Some(binary_path) = mcp_binary_path {
        // Use compiled binary directly
        tracing::info!("Using compiled MCP binary: {:?}", binary_path);
        (binary_path.to_string_lossy().to_string(), vec![])
    } else {
        // Fallback: use npx to run vibe-kanban with --mcp flag
        tracing::info!("MCP binary not found, using npx vibe-kanban --mcp");
        ("npx".to_string(), vec!["-y".to_string(), "vibe-kanban@latest".to_string(), "--mcp".to_string()])
    };

    match agent {
        PmChatAgent::ClaudeCli => {
            // Claude CLI uses mcpServers format
            json!({
                "mcpServers": {
                    "vibe_kanban": {
                        "command": command,
                        "args": args,
                        "env": {
                            "VIBE_BACKEND_URL": backend_url
                        }
                    }
                }
            })
        }
        PmChatAgent::CodexCli => {
            // Codex CLI uses mcp_servers format
            json!({
                "mcp_servers": {
                    "vibe_kanban": {
                        "command": command,
                        "args": args,
                        "env": {
                            "VIBE_BACKEND_URL": backend_url
                        }
                    }
                }
            })
        }
        PmChatAgent::GeminiCli => {
            // Gemini CLI uses mcpServers format (similar to Claude)
            json!({
                "mcpServers": {
                    "vibe_kanban": {
                        "command": command,
                        "args": args,
                        "env": {
                            "VIBE_BACKEND_URL": backend_url
                        }
                    }
                }
            })
        }
        PmChatAgent::OpencodeCli => {
            // OpenCode CLI uses mcp format
            json!({
                "mcp": {
                    "vibe_kanban": {
                        "command": command,
                        "args": args,
                        "env": {
                            "VIBE_BACKEND_URL": backend_url
                        }
                    }
                },
                "$schema": "https://opencode.ai/config.json"
            })
        }
    }
}

/// Create a streaming response using the specified CLI with MCP tools for task creation and docs management
/// This version streams CLI output line-by-line for real-time feedback
async fn create_mcp_cli_stream(
    agent: PmChatAgent,
    model: String,
    system_prompt: String,
    user_content: String,
    pool: sqlx::SqlitePool,
    project_id: Uuid,
) -> Result<Sse<SseStream>, ApiError> {
    // Resolve the CLI path based on the agent
    let cli_path_result = resolve_executable_path(agent.command_name()).await;
    let npx_path_result = resolve_executable_path("npx").await;

    // Get the backend URL for MCP server to connect to
    let backend_port = env::var("BACKEND_PORT").unwrap_or_else(|_| "45557".to_string());
    let backend_url = format!("http://localhost:{}", backend_port);

    // Get path to the compiled mcp_task_server binary
    // First try to find the binary in the target directory relative to current exe
    let current_exe = env::current_exe().ok();
    let mcp_binary_path = current_exe
        .as_ref()
        .and_then(|exe| exe.parent())
        .map(|dir| dir.join("mcp_task_server"))
        .filter(|p| p.exists());

    // Create temporary MCP config file based on agent type
    let mcp_config = create_mcp_config_for_agent(agent, &mcp_binary_path, &backend_url);

    // Write MCP config to temp file
    let temp_dir = env::temp_dir();
    let config_path = temp_dir.join(format!("vibe-pm-mcp-{}.json", project_id));

    if let Err(e) = fs::write(&config_path, serde_json::to_string_pretty(&mcp_config).unwrap_or_default()) {
        tracing::error!("Failed to write MCP config: {}", e);
        return Err(ApiError::BadRequest(format!("Failed to create MCP config: {}", e)));
    }

    tracing::info!("Created MCP config at {:?} with backend URL: {} for {:?}", config_path, backend_url, agent);

    // Prepare command based on agent and available CLI
    let (command_path, use_npx_fallback): (Option<PathBuf>, bool) = if let Some(path) = cli_path_result {
        tracing::info!("Running {:?} from: {:?} (streaming mode)", agent, path);
        (Some(path), false)
    } else if agent == PmChatAgent::ClaudeCli && npx_path_result.is_some() {
        // Only Claude CLI has npx fallback
        tracing::info!("Running Claude CLI with MCP via npx (streaming mode)");
        (npx_path_result, true)
    } else {
        // CLI not available - return error stream
        let agent_name = agent.display_name();
        let stream = async_stream::stream! {
            let event = AiChatStreamEvent {
                event_type: "error".to_string(),
                content: None,
                error: Some(format!("{} not found. Please install it first.", agent_name)),
                task_id: None,
                task_title: None,
            };
            yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            let done = AiChatStreamEvent { event_type: "done".to_string(), content: None, error: None, task_id: None, task_title: None };
            yield Ok(Event::default().data(serde_json::to_string(&done).unwrap_or_default()));
        };
        return Ok(Sse::new(stream.boxed()).keep_alive(KeepAlive::default()));
    };

    let Some(cmd_path) = command_path else {
        let stream = async_stream::stream! {
            let event = AiChatStreamEvent {
                event_type: "error".to_string(),
                content: None,
                error: Some("CLI executable not found.".to_string()),
                task_id: None,
                task_title: None,
            };
            yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            let done = AiChatStreamEvent { event_type: "done".to_string(), content: None, error: None, task_id: None, task_title: None };
            yield Ok(Event::default().data(serde_json::to_string(&done).unwrap_or_default()));
        };
        return Ok(Sse::new(stream.boxed()).keep_alive(KeepAlive::default()));
    };

    // Build command based on agent type
    let mut command = Command::new(&cmd_path);

    // Add npx-specific args for Claude CLI fallback
    if use_npx_fallback {
        command.arg("-y").arg("@anthropic-ai/claude-code@latest");
    }

    // Add agent-specific arguments
    match agent {
        PmChatAgent::ClaudeCli => {
            command
                .arg("--print")
                .arg("--verbose")
                .arg("--output-format")
                .arg("stream-json")
                .arg("--no-session-persistence")
                .arg("--dangerously-skip-permissions")
                .arg("--mcp-config")
                .arg(&config_path)
                .arg("--model")
                .arg(&model)
                .arg("--system-prompt")
                .arg(&system_prompt)
                .arg(&user_content);
        }
        PmChatAgent::CodexCli => {
            // Codex CLI uses exec subcommand with --json for streaming
            // Note: Codex doesn't support --mcp-config flag, MCP servers must be pre-configured
            command
                .arg("exec")
                .arg("--json")
                .arg("--full-auto");

            // Add model if specified (o3, o4-mini, gpt-4.1, codex-1, etc.)
            if !model.is_empty() && model != "default" {
                command.arg("--model").arg(&model);
            }

            command.arg(format!("{}\n\n{}", system_prompt, user_content));
        }
        PmChatAgent::GeminiCli => {
            // Gemini CLI supports streaming JSON output and non-interactive mode
            // Note: Gemini doesn't support --mcp-config flag, MCP servers must be pre-configured via `gemini mcp`
            command
                .arg("--output-format")
                .arg("stream-json")
                .arg("--yolo"); // Auto-approve all actions (non-interactive mode)

            // Add model if specified (gemini-3-flash, gemini-2.5-pro, etc.)
            if !model.is_empty() && model != "default" {
                command.arg("--model").arg(&model);
            }

            // Gemini doesn't have --system-prompt, include in the message
            command.arg(format!("{}\n\n{}", system_prompt, user_content));
        }
        PmChatAgent::OpencodeCli => {
            // OpenCode CLI uses run subcommand with --format json
            command
                .arg("run")
                .arg("--format")
                .arg("json")
                .arg("--model")
                .arg(&model)
                .arg(format!("{}\n\n{}", system_prompt, user_content));
        }
    }

    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Spawn process
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            // Clean up config file
            let _ = fs::remove_file(&config_path);
            let stream = async_stream::stream! {
                let event = AiChatStreamEvent {
                    event_type: "error".to_string(),
                    content: None,
                    error: Some(format!("Failed to spawn CLI: {}", e)),
                    task_id: None,
                    task_title: None,
                };
                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                let done = AiChatStreamEvent { event_type: "done".to_string(), content: None, error: None, task_id: None, task_title: None };
                yield Ok(Event::default().data(serde_json::to_string(&done).unwrap_or_default()));
            };
            return Ok(Sse::new(stream.boxed()).keep_alive(KeepAlive::default()));
        }
    };

    // Take ownership of stdout and stderr
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Shared state for collecting full response
    let full_response = Arc::new(Mutex::new(String::new()));
    let full_response_clone = full_response.clone();
    let model_clone = model.clone();
    let config_path_clone = config_path.clone();

    // Create the streaming response
    let stream = async_stream::stream! {
        // Send initial "thinking" indicator
        let thinking_event = AiChatStreamEvent {
            event_type: "thinking".to_string(),
            content: Some("AI is processing...".to_string()),
            error: None,
            task_id: None,
            task_title: None,
        };
        yield Ok(Event::default().data(serde_json::to_string(&thinking_event).unwrap_or_default()));

        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            // Stream each line as it comes
            // Each CLI has a different JSON format:
            // - Claude: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
            // - Codex: {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
            // - Gemini: {"type":"message","role":"assistant","content":"...","delta":true}
            while let Ok(Some(line)) = lines.next_line().await {
                if line.is_empty() {
                    continue;
                }

                // Skip non-JSON lines (like "Loading extension: ...")
                if !line.starts_with('{') {
                    tracing::debug!("CLI non-JSON output: {}", line);
                    continue;
                }

                if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&line) {
                    let event_type = json_value.get("type").and_then(|t| t.as_str());
                    let mut extracted_text: Option<String> = None;

                    match event_type {
                        // === Claude CLI format ===
                        // {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
                        Some("assistant") => {
                            if let Some(message) = json_value.get("message")
                                && let Some(content_array) = message.get("content").and_then(|c| c.as_array())
                            {
                                for block in content_array {
                                    if let Some(text) = block.get("text").and_then(|t| t.as_str())
                                        && !text.is_empty()
                                    {
                                        extracted_text = Some(text.to_string());
                                    }
                                }
                            }
                        }

                        // === Codex CLI format ===
                        // {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
                        // {"type":"item.completed","item":{"type":"reasoning","text":"..."}}
                        Some("item.completed") => {
                            if let Some(item) = json_value.get("item") {
                                let item_type = item.get("type").and_then(|t| t.as_str());
                                // Only extract agent_message, skip reasoning
                                if item_type == Some("agent_message") {
                                    if let Some(text) = item.get("text").and_then(|t| t.as_str())
                                        && !text.is_empty()
                                    {
                                        extracted_text = Some(text.to_string());
                                    }
                                }
                            }
                        }

                        // === Gemini CLI format ===
                        // {"type":"message","role":"assistant","content":"...","delta":true}
                        Some("message") => {
                            let role = json_value.get("role").and_then(|r| r.as_str());
                            if role == Some("assistant") {
                                if let Some(content) = json_value.get("content").and_then(|c| c.as_str())
                                    && !content.is_empty()
                                {
                                    extracted_text = Some(content.to_string());
                                }
                            }
                        }

                        // === Result events (Claude & Gemini) ===
                        Some("result") => {
                            // Claude: {"type":"result","result":"..."}
                            if let Some(result_text) = json_value.get("result").and_then(|r| r.as_str()) {
                                let current_response = full_response_clone.lock().await.clone();
                                if current_response.is_empty() && !result_text.is_empty() {
                                    extracted_text = Some(result_text.to_string());
                                }
                            }
                            // Gemini result is just stats, no text content
                        }

                        // System/init events - log for debugging
                        Some("system") | Some("init") | Some("thread.started") | Some("turn.started") | Some("turn.completed") => {
                            tracing::debug!("CLI event: {:?}", event_type);
                        }

                        // Unknown types - log and skip
                        _ => {
                            tracing::debug!("CLI unknown event type: {:?}", event_type);
                        }
                    }

                    // If we extracted text, send it as SSE event
                    if let Some(text) = extracted_text {
                        // Append to full response
                        {
                            let mut response = full_response_clone.lock().await;
                            if !response.is_empty() && !text.starts_with(' ') {
                                response.push(' ');
                            }
                            response.push_str(&text);
                        }

                        // Send as SSE event
                        let event = AiChatStreamEvent {
                            event_type: "content".to_string(),
                            content: Some(text),
                            error: None,
                            task_id: None,
                            task_title: None,
                        };
                        yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                    }
                } else {
                    // If not valid JSON, treat as plain text (fallback)
                    tracing::debug!("CLI non-JSON line: {}", line);
                    {
                        let mut response = full_response_clone.lock().await;
                        if !response.is_empty() {
                            response.push('\n');
                        }
                        response.push_str(&line);
                    }

                    let event = AiChatStreamEvent {
                        event_type: "content".to_string(),
                        content: Some(line),
                        error: None,
                        task_id: None,
                        task_title: None,
                    };
                    yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
                }
            }
        }

        // Check for stderr messages
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if !line.is_empty() {
                    tracing::debug!("Claude CLI stderr: {}", line);
                }
            }
        }

        // Wait for the child process to complete
        let exit_status = child.wait().await;

        // Clean up temp config file
        if let Err(e) = fs::remove_file(&config_path_clone) {
            tracing::warn!("Failed to remove temp MCP config: {}", e);
        }

        // Get the full response and save to conversation history
        let final_response = full_response_clone.lock().await.clone();
        if !final_response.is_empty() {
            let _ = PmConversation::create(
                &pool,
                &CreatePmConversation {
                    project_id,
                    role: PmMessageRole::Assistant,
                    content: final_response,
                    model: Some(model_clone),
                },
            )
            .await;
        }

        // Check exit status for errors
        match exit_status {
            Ok(status) if !status.success() => {
                let event = AiChatStreamEvent {
                    event_type: "error".to_string(),
                    content: None,
                    error: Some(format!("CLI exited with status: {}", status)),
                    task_id: None,
                    task_title: None,
                };
                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            }
            Err(e) => {
                let event = AiChatStreamEvent {
                    event_type: "error".to_string(),
                    content: None,
                    error: Some(format!("CLI error: {}", e)),
                    task_id: None,
                    task_title: None,
                };
                yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
            }
            _ => {}
        }

        // Send done event
        let done = AiChatStreamEvent {
            event_type: "done".to_string(),
            content: None,
            error: None,
            task_id: None,
            task_title: None,
        };
        yield Ok(Event::default().data(serde_json::to_string(&done).unwrap_or_default()));
    };

    Ok(Sse::new(stream.boxed()).keep_alive(KeepAlive::default()))
}

/// Clear all PM chat messages for a project
pub async fn clear_chat(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected =
        PmConversation::delete_by_project_id(&deployment.db().pool, project.id).await?;

    deployment
        .track_if_analytics_allowed(
            "pm_chat_cleared",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "messages_deleted": rows_affected,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Delete a specific message
/// Uses tuple to extract both project_id (from parent route) and message_id
pub async fn delete_message(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path((_project_id, message_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    // First verify the message belongs to this project
    let message = PmConversation::find_by_id(&deployment.db().pool, message_id).await?;

    match message {
        Some(msg) if msg.project_id == project.id => {
            PmConversation::delete(&deployment.db().pool, message_id).await?;
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Some(_) => Err(ApiError::BadRequest(
            "Message does not belong to this project".to_string(),
        )),
        None => Err(ApiError::Database(sqlx::Error::RowNotFound)),
    }
}

/// Get all attachments for a project
pub async fn get_attachments(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<PmAttachment>>>, ApiError> {
    let attachments = PmAttachment::find_by_project_id(&deployment.db().pool, project.id).await?;
    Ok(ResponseJson(ApiResponse::success(attachments)))
}

/// Get the PM attachments directory
fn get_pm_attachments_dir() -> PathBuf {
    let cache_dir = utils::cache_dir().join("pm-attachments");
    fs::create_dir_all(&cache_dir).ok();
    cache_dir
}

/// Sanitize filename for filesystem safety
fn sanitize_filename(name: &str) -> String {
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");

    let clean: String = stem
        .to_lowercase()
        .chars()
        .map(|c| if c.is_whitespace() { '_' } else { c })
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect();

    let max_len = 50;
    if clean.len() > max_len {
        clean[..max_len].to_string()
    } else if clean.is_empty() {
        "file".to_string()
    } else {
        clean
    }
}

/// Get MIME type from file extension
fn get_mime_type(filename: &str) -> String {
    let extension = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "xml" => "application/xml",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" => "application/javascript",
        "ts" => "application/typescript",
        "zip" => "application/zip",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "csv" => "text/csv",
        _ => "application/octet-stream",
    }
    .to_string()
}

/// Upload an attachment to PM chat
pub async fn upload_attachment(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    mut multipart: Multipart,
) -> Result<ResponseJson<ApiResponse<PmAttachment>>, ApiError> {
    let attachments_dir = get_pm_attachments_dir();

    while let Some(field) = multipart.next_field().await? {
        if field.name() == Some("file") {
            let original_filename = field
                .file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "file".to_string());

            let data = field.bytes().await?;
            let file_size = data.len() as i64;

            // Check file size limit (20MB)
            const MAX_SIZE: i64 = 20 * 1024 * 1024;
            if file_size > MAX_SIZE {
                return Err(ApiError::BadRequest(format!(
                    "File too large: {} bytes (max: {} bytes)",
                    file_size, MAX_SIZE
                )));
            }

            // Calculate hash for deduplication
            let hash = format!("{:x}", Sha256::digest(&data));

            // Get extension and mime type
            let extension = std::path::Path::new(&original_filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("bin");
            let mime_type = get_mime_type(&original_filename);

            // Create unique filename
            let clean_name = sanitize_filename(&original_filename);
            let new_filename = format!("{}_{}.{}", Uuid::new_v4(), clean_name, extension);
            let file_path = attachments_dir.join(&new_filename);

            // Write file to disk
            fs::write(&file_path, &data)?;

            // Create a placeholder conversation for direct attachments
            // In a real implementation, you might want to link this to a specific message
            let conversation = PmConversation::create(
                &deployment.db().pool,
                &CreatePmConversation {
                    project_id: project.id,
                    role: PmMessageRole::User,
                    content: format!("[Attachment: {}]", original_filename),
                    model: None,
                },
            )
            .await?;

            // Create attachment record
            let attachment = PmAttachment::create(
                &deployment.db().pool,
                &CreatePmAttachment {
                    conversation_id: conversation.id,
                    project_id: project.id,
                    file_name: original_filename,
                    file_path: new_filename,
                    mime_type,
                    file_size,
                    sha256: Some(hash),
                },
            )
            .await?;

            deployment
                .track_if_analytics_allowed(
                    "pm_attachment_uploaded",
                    serde_json::json!({
                        "project_id": project.id.to_string(),
                        "attachment_id": attachment.id.to_string(),
                        "file_size": file_size,
                        "mime_type": &attachment.mime_type,
                    }),
                )
                .await;

            return Ok(ResponseJson(ApiResponse::success(attachment)));
        }
    }

    Err(ApiError::BadRequest("No file provided".to_string()))
}

/// Serve an attachment file
pub async fn serve_attachment(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path((_project_id, attachment_id)): Path<(Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    let attachment = PmAttachment::find_by_id(&deployment.db().pool, attachment_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Attachment not found".to_string()))?;

    // Verify the attachment belongs to this project
    if attachment.project_id != project.id {
        return Err(ApiError::BadRequest(
            "Attachment does not belong to this project".to_string(),
        ));
    }

    let attachments_dir = get_pm_attachments_dir();
    let file_path = attachments_dir.join(&attachment.file_path);

    let file = File::open(&file_path)
        .await
        .map_err(|_| ApiError::BadRequest("Attachment file not found".to_string()))?;
    let metadata = file.metadata().await?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, &attachment.mime_type)
        .header(header::CONTENT_LENGTH, metadata.len())
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", attachment.file_name),
        )
        .header(header::CACHE_CONTROL, "public, max-age=31536000")
        .body(body)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    Ok(response)
}

/// Delete an attachment
pub async fn delete_attachment(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Path((_project_id, attachment_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let attachment = PmAttachment::find_by_id(&deployment.db().pool, attachment_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Attachment not found".to_string()))?;

    // Verify the attachment belongs to this project
    if attachment.project_id != project.id {
        return Err(ApiError::BadRequest(
            "Attachment does not belong to this project".to_string(),
        ));
    }

    // Delete the file from disk
    let attachments_dir = get_pm_attachments_dir();
    let file_path = attachments_dir.join(&attachment.file_path);
    if file_path.exists() {
        fs::remove_file(file_path).ok();
    }

    // Delete from database
    PmAttachment::delete(&deployment.db().pool, attachment_id).await?;

    deployment
        .track_if_analytics_allowed(
            "pm_attachment_deleted",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "attachment_id": attachment_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Get PM docs for a project
pub async fn get_pm_docs(
    Extension(project): Extension<Project>,
) -> Result<ResponseJson<ApiResponse<Option<String>>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(project.pm_docs)))
}

/// Update PM docs for a project
pub async fn update_pm_docs(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdatePmDocsRequest>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    use db::models::project::UpdateProject;

    let update_data = UpdateProject {
        name: None,
        pm_task_id: None,
        pm_docs: payload.pm_docs,
    };

    let updated_project =
        db::models::project::Project::update(&deployment.db().pool, project.id, &update_data)
            .await?;

    deployment
        .track_if_analytics_allowed(
            "pm_docs_updated",
            serde_json::json!({
                "project_id": project.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_project)))
}

/// Response for task summary with dependencies
#[derive(Debug, Clone, Serialize, TS)]
pub struct TaskWithDependencies {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub depends_on: Vec<String>,  // Task IDs this task depends on
    pub depended_by: Vec<String>, // Task IDs that depend on this task
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct TaskSummaryResponse {
    pub tasks: Vec<TaskWithDependencies>,
    pub summary_text: String, // Formatted text for PM docs
}

/// Get task summary with dependencies for PM context
pub async fn get_task_summary(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskSummaryResponse>>, ApiError> {
    // Get all tasks for this project
    let tasks_with_status =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id).await?;
    let tasks: Vec<Task> = tasks_with_status.iter().map(|t| t.task.clone()).collect();

    // Build task map for quick lookup
    let task_map: std::collections::HashMap<_, _> = tasks.iter().map(|t| (t.id, t)).collect();

    // Get dependencies for each task
    let mut tasks_with_deps = Vec::new();
    for task in &tasks {
        let depends_on = TaskDependency::find_dependencies(&deployment.db().pool, task.id).await?;
        let depended_by = TaskDependency::find_dependents(&deployment.db().pool, task.id).await?;

        tasks_with_deps.push(TaskWithDependencies {
            id: task.id.to_string(),
            title: task.title.clone(),
            description: task.description.clone(),
            status: format!("{:?}", task.status).to_lowercase(),
            priority: format!("{:?}", task.priority).to_lowercase(),
            depends_on: depends_on.iter().map(|id| id.to_string()).collect(),
            depended_by: depended_by.iter().map(|id| id.to_string()).collect(),
        });
    }

    // Generate formatted summary text
    let mut summary_lines = vec!["## タスク一覧と依存関係".to_string(), "".to_string()];

    // Group by status
    let status_labels = [
        ("todo", "📋 未着手 (Todo)"),
        ("inprogress", "🔄 進行中 (In Progress)"),
        ("inreview", "👀 レビュー中 (In Review)"),
        ("done", "✅ 完了 (Done)"),
    ];

    for (status, label) in status_labels.iter() {
        let status_tasks: Vec<_> = tasks_with_deps
            .iter()
            .filter(|t| t.status == *status)
            .collect();

        if !status_tasks.is_empty() {
            summary_lines.push(format!("### {}", label));
            summary_lines.push("".to_string());

            for task in status_tasks {
                // Task title with priority indicator
                let priority_icon = match task.priority.as_str() {
                    "urgent" => "🔴",
                    "high" => "🟠",
                    "medium" => "🟡",
                    "low" => "🟢",
                    _ => "⚪",
                };

                summary_lines.push(format!("- {} **{}**", priority_icon, task.title));

                // Dependencies
                if !task.depends_on.is_empty() {
                    let dep_names: Vec<_> = task
                        .depends_on
                        .iter()
                        .filter_map(|id| {
                            uuid::Uuid::parse_str(id)
                                .ok()
                                .and_then(|uuid| task_map.get(&uuid))
                                .map(|t| t.title.clone())
                        })
                        .collect();
                    if !dep_names.is_empty() {
                        summary_lines.push(format!("  - ⬅️ 依存: {}", dep_names.join(", ")));
                    }
                }

                // Dependents (blocking)
                if !task.depended_by.is_empty() {
                    let blocking_names: Vec<_> = task
                        .depended_by
                        .iter()
                        .filter_map(|id| {
                            uuid::Uuid::parse_str(id)
                                .ok()
                                .and_then(|uuid| task_map.get(&uuid))
                                .map(|t| t.title.clone())
                        })
                        .collect();
                    if !blocking_names.is_empty() {
                        summary_lines
                            .push(format!("  - ➡️ ブロック中: {}", blocking_names.join(", ")));
                    }
                }
            }
            summary_lines.push("".to_string());
        }
    }

    // Add dependency chain analysis
    let blocked_tasks: Vec<_> = tasks_with_deps
        .iter()
        .filter(|t| {
            t.status != "done"
                && !t.depends_on.is_empty()
                && t.depends_on.iter().any(|dep_id| {
                    uuid::Uuid::parse_str(dep_id)
                        .ok()
                        .and_then(|uuid| task_map.get(&uuid))
                        .map(|dep_task| format!("{:?}", dep_task.status).to_lowercase() != "done")
                        .unwrap_or(false)
                })
        })
        .collect();

    if !blocked_tasks.is_empty() {
        summary_lines.push("### ⚠️ ブロックされているタスク".to_string());
        summary_lines.push("".to_string());
        for task in blocked_tasks {
            let blocking_names: Vec<_> = task
                .depends_on
                .iter()
                .filter_map(|id| {
                    uuid::Uuid::parse_str(id)
                        .ok()
                        .and_then(|uuid| task_map.get(&uuid))
                        .filter(|t| format!("{:?}", t.status).to_lowercase() != "done")
                        .map(|t| t.title.clone())
                })
                .collect();
            summary_lines.push(format!(
                "- **{}** は以下の完了待ち: {}",
                task.title,
                blocking_names.join(", ")
            ));
        }
        summary_lines.push("".to_string());
    }

    let summary_text = summary_lines.join("\n");

    Ok(ResponseJson(ApiResponse::success(TaskSummaryResponse {
        tasks: tasks_with_deps,
        summary_text,
    })))
}

/// Sync task summary to PM docs
pub async fn sync_task_summary_to_docs(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Project>>, ApiError> {
    use db::models::project::UpdateProject;

    // Get task summary
    let tasks_with_status =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id).await?;
    let tasks: Vec<Task> = tasks_with_status.iter().map(|t| t.task.clone()).collect();
    let task_map: std::collections::HashMap<_, _> = tasks.iter().map(|t| (t.id, t)).collect();

    // Generate summary (same logic as above, simplified for docs)
    let mut summary_lines = vec![
        "## タスク一覧と依存関係".to_string(),
        format!("*最終更新: {}*", Utc::now().format("%Y-%m-%d %H:%M UTC")),
        "".to_string(),
    ];

    let status_labels = [
        ("Todo", "📋 未着手"),
        ("InProgress", "🔄 進行中"),
        ("InReview", "👀 レビュー中"),
        ("Done", "✅ 完了"),
    ];

    for (status_variant, label) in status_labels.iter() {
        let status_tasks: Vec<_> = tasks
            .iter()
            .filter(|t| format!("{:?}", t.status) == *status_variant)
            .collect();

        if !status_tasks.is_empty() {
            summary_lines.push(format!("### {}", label));

            for task in status_tasks {
                let deps =
                    TaskDependency::find_dependencies(&deployment.db().pool, task.id).await?;
                let priority_icon = match format!("{:?}", task.priority).as_str() {
                    "Urgent" => "🔴",
                    "High" => "🟠",
                    "Medium" => "🟡",
                    "Low" => "🟢",
                    _ => "⚪",
                };

                summary_lines.push(format!("- {} {}", priority_icon, task.title));

                if !deps.is_empty() {
                    let dep_names: Vec<_> = deps
                        .iter()
                        .filter_map(|id| task_map.get(id).map(|t| t.title.clone()))
                        .collect();
                    if !dep_names.is_empty() {
                        summary_lines.push(format!("  - 依存: {}", dep_names.join(", ")));
                    }
                }
            }
            summary_lines.push("".to_string());
        }
    }

    let task_summary = summary_lines.join("\n");

    // Update PM docs - append or replace task summary section
    let new_docs = if let Some(existing_docs) = &project.pm_docs {
        // Find and replace existing task summary section, or append
        if existing_docs.contains("## タスク一覧と依存関係") {
            // Replace existing section
            let parts: Vec<&str> = existing_docs.split("## タスク一覧と依存関係").collect();
            if parts.len() >= 2 {
                // Find the end of the task section (next ## or end of doc)
                let after_task_section = parts[1];
                let end_of_section = after_task_section
                    .find("\n## ")
                    .map(|pos| &after_task_section[pos..])
                    .unwrap_or("");
                format!("{}{}{}", parts[0], task_summary, end_of_section)
            } else {
                format!("{}\n\n{}", existing_docs, task_summary)
            }
        } else {
            format!("{}\n\n{}", existing_docs, task_summary)
        }
    } else {
        task_summary
    };

    let update_data = UpdateProject {
        name: None,
        pm_task_id: None,
        pm_docs: Some(new_docs),
    };

    let updated_project =
        db::models::project::Project::update(&deployment.db().pool, project.id, &update_data)
            .await?;

    deployment
        .track_if_analytics_allowed(
            "pm_task_summary_synced",
            serde_json::json!({
                "project_id": project.id.to_string(),
                "task_count": tasks.len(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_project)))
}

/// A workspace document from the docs/ folder
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct WorkspaceDoc {
    pub path: String,      // Relative path from docs/ folder
    pub repo_name: String, // Which repo this doc is from
    pub content: String,   // Full content of the document
}

/// Response for workspace docs
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct WorkspaceDocsResponse {
    pub docs: Vec<WorkspaceDoc>,
}

/// Get workspace documentation files from project repos
pub async fn get_workspace_docs(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<WorkspaceDocsResponse>>, ApiError> {
    use services::services::docs_scanner::scan_docs_folder;

    // Get all repos for this project
    let repos = ProjectRepo::find_repos_for_project(&deployment.db().pool, project.id).await?;

    let mut all_docs = Vec::new();

    for repo in repos {
        // Scan docs folder for this repo
        let scanned_docs = scan_docs_folder(&repo.path).await;

        for doc in scanned_docs {
            all_docs.push(WorkspaceDoc {
                path: doc.relative_path,
                repo_name: repo.display_name.clone(),
                content: doc.content,
            });
        }
    }

    Ok(ResponseJson(ApiResponse::success(WorkspaceDocsResponse {
        docs: all_docs,
    })))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/", get(get_pm_chat).post(send_message).delete(clear_chat))
        .route("/ai-chat", post(ai_chat))
        .route("/ai-agents", get(get_available_agents))
        .route("/messages/{message_id}", delete(delete_message))
        .route("/attachments", get(get_attachments).post(upload_attachment))
        .route("/attachments/{attachment_id}", delete(delete_attachment))
        .route("/attachments/{attachment_id}/file", get(serve_attachment))
        .route("/docs", get(get_pm_docs).put(update_pm_docs))
        .route("/workspace-docs", get(get_workspace_docs))
        .route(
            "/task-summary",
            get(get_task_summary).post(sync_task_summary_to_docs),
        )
        .layer(DefaultBodyLimit::max(20 * 1024 * 1024)) // 20MB limit for file uploads
}
