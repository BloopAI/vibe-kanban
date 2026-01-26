use std::{fs, path::PathBuf, process::Stdio};

use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{StatusCode, header},
    response::{
        Json as ResponseJson, Response,
        sse::{Event, KeepAlive, Sse},
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
    repo::Repo,
    task::Task,
};
use deployment::Deployment;
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::{fs::File, process::Command};
use tokio_util::io::ReaderStream;
use ts_rs::TS;
use utils::{response::ApiResponse, shell::resolve_executable_path};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

/// Request payload for sending a chat message
#[derive(Debug, Clone, Deserialize, TS)]
pub struct SendMessageRequest {
    pub content: String,
    pub role: Option<String>, // "user", "assistant", or "system" - defaults to "user"
}

/// Request payload for AI-assisted chat
#[derive(Debug, Clone, Deserialize, TS)]
pub struct AiChatRequest {
    pub content: String,
    pub model: Option<String>, // e.g., "sonnet", "opus", "haiku"
}

/// SSE event data for streaming AI response
#[derive(Debug, Clone, Serialize)]
pub struct AiChatStreamEvent {
    #[serde(rename = "type")]
    pub event_type: String, // "content", "done", "error"
    pub content: Option<String>,
    pub error: Option<String>,
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

/// Send a message and get an AI response using Claude CLI
/// Note: The user message should be sent via send_message() first, then call this endpoint
pub async fn ai_chat(
    Extension(project): Extension<Project>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AiChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, ApiError> {
    // Get conversation history for context (user message should already be saved)
    let messages = PmConversation::find_by_project_id(&deployment.db().pool, project.id).await?;

    // Build conversation context
    let mut conversation_context = String::new();
    for msg in messages.iter().rev().take(20).rev() {
        let role = match msg.role.as_str() {
            "user" => "User",
            "assistant" => "Assistant",
            "system" => "System",
            _ => "User",
        };
        conversation_context.push_str(&format!("{}: {}\n\n", role, msg.content));
    }

    // Build system prompt with PM context
    let mut system_prompt = String::from(
        "You are a helpful Project Manager assistant. You help with project planning, task management, and technical discussions.\n\n",
    );

    // Add PM docs if available
    if let Some(ref docs) = project.pm_docs {
        system_prompt.push_str("## Project Documentation\n");
        system_prompt.push_str(docs);
        system_prompt.push_str("\n\n");
    }

    // Get task summary
    let tasks_with_status =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, project.id)
            .await
            .unwrap_or_default();

    if !tasks_with_status.is_empty() {
        system_prompt.push_str("## Current Tasks\n");
        for task_with_status in &tasks_with_status {
            let task = &task_with_status.task;
            system_prompt.push_str(&format!(
                "- [{:?}] {} (Priority: {:?})\n",
                task.status, task.title, task.priority
            ));
        }
        system_prompt.push('\n');
    }

    system_prompt.push_str("## Conversation History\n");
    system_prompt.push_str(&conversation_context);

    // Prepare Claude CLI command - clone values for 'static lifetime
    let model = payload
        .model
        .clone()
        .unwrap_or_else(|| "sonnet".to_string());
    let user_content = payload.content.clone();
    let system_prompt_owned = system_prompt;

    let pool = deployment.db().pool.clone();
    let project_id = project.id;

    // Get the project's workspace path from its repositories
    // This is where Claude CLI should run to have proper codebase context
    let workspace_path = {
        let project_repos = ProjectRepo::find_by_project_id(&pool, project_id)
            .await
            .unwrap_or_default();
        if let Some(first_project_repo) = project_repos.first() {
            if let Ok(Some(repo)) = Repo::find_by_id(&pool, first_project_repo.repo_id).await {
                Some(repo.path)
            } else {
                None
            }
        } else {
            // Fall back to default_agent_working_dir if no repos
            project.default_agent_working_dir.map(PathBuf::from)
        }
    };

    tracing::info!("PM Chat AI workspace path: {:?}", workspace_path);

    // Run claude CLI - try global claude binary first, then fallback to npx
    // Use simple --print mode without stream-json to avoid known bugs
    // See: https://github.com/anthropics/claude-code/issues/1920, #8126, #3187
    let claude_path_result = resolve_executable_path("claude").await;
    let npx_path_result = resolve_executable_path("npx").await;

    // Execute CLI and get response
    let (response_text, error_text) = if let Some(claude_path) = claude_path_result {
        // Use global claude binary (faster than npx)
        tracing::info!(
            "Running Claude CLI from global binary at: {:?}",
            claude_path
        );

        // Use tokio timeout - increased to 3 minutes for Claude Code initialization
        // --dangerously-skip-permissions is required to skip permission prompts in non-interactive mode
        let mut command = Command::new(&claude_path);
        command
            .arg("--print")
            .arg("--dangerously-skip-permissions")
            .arg("--model")
            .arg(&model)
            .arg("--system-prompt")
            .arg(&system_prompt_owned)
            .arg(&user_content)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set working directory to project workspace if available
        if let Some(ref path) = workspace_path {
            tracing::info!("Setting Claude CLI working directory to: {:?}", path);
            command.current_dir(path);
        }

        let output_future = command.output();

        let output = tokio::time::timeout(std::time::Duration::from_secs(180), output_future).await;

        // Parse the output - with --print (no stream-json), output is plain text
        match output {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr);

                tracing::debug!("Claude CLI stdout length: {}", stdout.len());
                if !stderr.is_empty() {
                    tracing::warn!("Claude CLI stderr: {}", stderr);
                }

                if stdout.is_empty() {
                    (
                        None,
                        Some(format!(
                            "No response from Claude CLI. Exit code: {:?}. stderr: {}",
                            output.status.code(),
                            stderr
                        )),
                    )
                } else {
                    (Some(stdout), None)
                }
            }
            Ok(Err(e)) => {
                tracing::error!("Failed to run Claude CLI: {}", e);
                (
                    None,
                    Some(format!(
                        "Failed to run Claude CLI: {}. Make sure Claude Code is installed.",
                        e
                    )),
                )
            }
            Err(_) => {
                tracing::error!("Claude CLI timed out after 180 seconds");
                (
                    None,
                    Some("Claude CLI timed out after 180 seconds.".to_string()),
                )
            }
        }
    } else if let Some(npx_path) = npx_path_result {
        // Fallback to npx if global claude not found
        tracing::info!("Running Claude CLI with npx at: {:?}", npx_path);

        let mut command = Command::new(&npx_path);
        command
            .arg("-y")
            .arg("@anthropic-ai/claude-code@latest")
            .arg("--print")
            .arg("--dangerously-skip-permissions")
            .arg("--model")
            .arg(&model)
            .arg("--system-prompt")
            .arg(&system_prompt_owned)
            .arg(&user_content)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set working directory to project workspace if available
        if let Some(ref path) = workspace_path {
            tracing::info!("Setting Claude CLI working directory to: {:?}", path);
            command.current_dir(path);
        }

        let output_future = command.output();

        let output = tokio::time::timeout(std::time::Duration::from_secs(180), output_future).await;

        // Parse the output - with --print (no stream-json), output is plain text
        match output {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr);

                tracing::debug!("Claude CLI stdout length: {}", stdout.len());
                if !stderr.is_empty() {
                    tracing::warn!("Claude CLI stderr: {}", stderr);
                }

                if stdout.is_empty() {
                    (
                        None,
                        Some(format!(
                            "No response from Claude CLI. Exit code: {:?}. stderr: {}",
                            output.status.code(),
                            stderr
                        )),
                    )
                } else {
                    (Some(stdout), None)
                }
            }
            Ok(Err(e)) => {
                tracing::error!("Failed to run Claude CLI: {}", e);
                (
                    None,
                    Some(format!(
                        "Failed to run Claude CLI: {}. Make sure Claude Code is installed.",
                        e
                    )),
                )
            }
            Err(_) => {
                tracing::error!("Claude CLI (npx) timed out after 180 seconds");
                (
                    None,
                    Some("Claude CLI timed out after 180 seconds.".to_string()),
                )
            }
        }
    } else {
        tracing::error!("Neither claude nor npx found in PATH");
        (None, Some("Claude CLI not found. Please install Claude Code (https://claude.ai/code) or ensure Node.js is installed.".to_string()))
    };

    // Save assistant response if we got one
    if let Some(ref response) = response_text {
        let _ = PmConversation::create(
            &pool,
            &CreatePmConversation {
                project_id,
                role: PmMessageRole::Assistant,
                content: response.clone(),
                model: Some(model.clone()),
            },
        )
        .await;
    }

    // Create SSE stream with the response
    let stream = async_stream::stream! {
        if let Some(content) = response_text {
            let event = AiChatStreamEvent {
                event_type: "content".to_string(),
                content: Some(content),
                error: None,
            };
            yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
        }

        if let Some(error) = error_text {
            let event = AiChatStreamEvent {
                event_type: "error".to_string(),
                content: None,
                error: Some(error),
            };
            yield Ok(Event::default().data(serde_json::to_string(&event).unwrap_or_default()));
        }

        let done_event = AiChatStreamEvent {
            event_type: "done".to_string(),
            content: None,
            error: None,
        };
        yield Ok(Event::default().data(serde_json::to_string(&done_event).unwrap_or_default()));
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
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

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/", get(get_pm_chat).post(send_message).delete(clear_chat))
        .route("/ai-chat", post(ai_chat))
        .route("/messages/{message_id}", delete(delete_message))
        .route("/attachments", get(get_attachments).post(upload_attachment))
        .route("/attachments/{attachment_id}", delete(delete_attachment))
        .route("/attachments/{attachment_id}/file", get(serve_attachment))
        .route("/docs", get(get_pm_docs).put(update_pm_docs))
        .route(
            "/task-summary",
            get(get_task_summary).post(sync_task_summary_to_docs),
        )
        .layer(DefaultBodyLimit::max(20 * 1024 * 1024)) // 20MB limit for file uploads
}
