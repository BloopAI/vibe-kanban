use std::{path::PathBuf, process::Stdio, time::Duration};

use axum::{Json, Router, response::Json as ResponseJson, routing::post};
use db::models::project::Project;
use deployment::Deployment;
use executors::profile::{ExecutorConfigs, ExecutorProfileId};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

const REFINEMENT_SYSTEM_PROMPT: &str = r#"You are an experienced software engineer. Rewrite the given task as a clear, actionable specification for a coding agent.

OUTPUT ONLY THE REFINED TASK. No commentary, no meta-discussion, no "here's what I improved."

Format:
## [Clear, actionable title]

[1-3 sentence description of what to build/fix]

### Acceptance Criteria
- [Specific, testable condition] (e.g., "User sees confirmation toast after save")
- [Another condition]
- (3-5 maximum, focus on observable behavior)

### Edge Cases
- [Error state]: [How to handle] (e.g., "Network failure: show retry button")
- (Only include realistic scenarios)

### Implementation Hints
- [Reference specific files/patterns from this codebase if relevant]
- [Suggest reusing existing components you find]

Rules:
- If input is vague (e.g., "add login"), make reasonable assumptions and note them
- If input is already well-specified, return it with minor formatting improvements only
- If input has typos or rambling, clean it up into professional prose
- Never add unnecessary scope—keep it minimal
- Skip sections that aren't relevant (e.g., skip Edge Cases for trivial tasks)"#;

const REFINEMENT_SYSTEM_PROMPT_NO_CODEBASE: &str = r#"You are an experienced software engineer. Rewrite the given task as a clear, actionable specification for a coding agent.

IMPORTANT: Do NOT read files, explore the codebase, or use any tools. Work only from the task description provided.

OUTPUT ONLY THE REFINED TASK. No commentary, no meta-discussion, no "here's what I improved."

Format:
## [Clear, actionable title]

[1-3 sentence description of what to build/fix]

### Acceptance Criteria
- [Specific, testable condition] (e.g., "User sees confirmation toast after save")
- [Another condition]
- (3-5 maximum, focus on observable behavior)

### Edge Cases
- [Error state]: [How to handle] (e.g., "Network failure: show retry button")
- (Only include realistic scenarios)

Rules:
- If input is vague (e.g., "add login"), make reasonable assumptions and note them
- If input is already well-specified, return it with minor formatting improvements only
- If input has typos or rambling, clean it up into professional prose
- Never add unnecessary scope—keep it minimal
- Skip sections that aren't relevant (e.g., skip Edge Cases for trivial tasks)"#;

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct RefineDescriptionRequest {
    pub title: String,
    pub description: String,
    pub include_codebase_context: bool,
    pub executor_profile_id: ExecutorProfileId,
    pub project_id: String,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RefineDescriptionResponse {
    pub suggestions: String,
}

pub async fn refine_description(
    axum::extract::State(deployment): axum::extract::State<DeploymentImpl>,
    Json(payload): Json<RefineDescriptionRequest>,
) -> Result<ResponseJson<ApiResponse<RefineDescriptionResponse>>, ApiError> {
    let project_id: uuid::Uuid = payload
        .project_id
        .parse()
        .map_err(|_| ApiError::BadRequest("Invalid project_id".to_string()))?;

    let _project = Project::find_by_id(&deployment.db().pool, project_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Project not found".to_string()))?;

    // Get the first repository path for this project as the working directory
    let project_repos =
        db::models::project_repo::ProjectRepo::find_by_project_id(&deployment.db().pool, project_id)
            .await?;

    let working_dir = if let Some(first_repo) = project_repos.first() {
        let repo =
            db::models::repo::Repo::find_by_id(&deployment.db().pool, first_repo.repo_id).await?;
        repo.map(|r| PathBuf::from(&r.path))
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(".")
    };

    // Get executor configuration
    let executor_profile_id = payload.executor_profile_id.clone();
    let agent = ExecutorConfigs::get_cached()
        .get_coding_agent(&executor_profile_id)
        .ok_or_else(|| {
            ApiError::BadRequest(format!(
                "Unknown executor profile: {}",
                executor_profile_id
            ))
        })?;

    // Build the prompt for refinement
    let system_prompt = if payload.include_codebase_context {
        REFINEMENT_SYSTEM_PROMPT
    } else {
        REFINEMENT_SYSTEM_PROMPT_NO_CODEBASE
    };

    let user_prompt = format!(
        "Please refine this task:\n\n**Title:** {}\n\n**Description:**\n{}",
        payload.title,
        if payload.description.trim().is_empty() {
            "(No description provided)"
        } else {
            &payload.description
        }
    );

    // Full prompt with system context
    let full_prompt = format!("{}\n\n---\n\n{}", system_prompt, user_prompt);

    // Execute the refinement using Claude Code CLI
    let suggestions = execute_refinement(&agent, &working_dir, &full_prompt).await?;

    Ok(ResponseJson(ApiResponse::success(RefineDescriptionResponse {
        suggestions,
    })))
}

async fn execute_refinement(
    agent: &executors::executors::CodingAgent,
    working_dir: &PathBuf,
    prompt: &str,
) -> Result<String, ApiError> {
    // Build the command based on the executor type
    // For now, we primarily support Claude Code since that's what the user has
    let (program, args) = match agent {
        executors::executors::CodingAgent::ClaudeCode(claude) => {
            let mut cmd_args: Vec<String> = vec![
                "-y".to_string(),
                if claude.claude_code_router.unwrap_or(false) {
                    "@musistudio/claude-code-router@1.0.66".to_string()
                } else {
                    "@anthropic-ai/claude-code@2.0.75".to_string()
                },
            ];

            if claude.claude_code_router.unwrap_or(false) {
                cmd_args.push("code".to_string());
            }

            cmd_args.extend([
                "-p".to_string(),
                prompt.to_string(),
                "--output-format=text".to_string(),
                "--max-turns=1".to_string(),
            ]);

            if claude.dangerously_skip_permissions.unwrap_or(false) {
                cmd_args.push("--dangerously-skip-permissions".to_string());
            }

            if let Some(model) = &claude.model {
                cmd_args.extend(["--model".to_string(), model.clone()]);
            }

            ("npx".to_string(), cmd_args)
        }
        _ => {
            return Err(ApiError::BadRequest(
                "Only Claude Code executor is currently supported for task refinement".to_string(),
            ));
        }
    };

    // Spawn the process
    let mut command = tokio::process::Command::new(&program);
    command
        .args(&args)
        .current_dir(working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let child = command.spawn()?;

    // Wait for completion with timeout (2 minutes should be enough for a single-turn refinement)
    let output = tokio::time::timeout(Duration::from_secs(120), child.wait_with_output())
        .await
        .map_err(|_| ApiError::BadRequest("Refinement request timed out".to_string()))?
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!("Refinement executor failed: {}", stderr);
        return Err(ApiError::BadRequest(format!(
            "Executor failed: {}",
            stderr.chars().take(500).collect::<String>()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // Clean up the output - remove any JSON wrapper if present
    let suggestions = stdout.trim().to_string();

    if suggestions.is_empty() {
        return Err(ApiError::BadRequest(
            "No suggestions generated by the executor".to_string(),
        ));
    }

    Ok(suggestions)
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/tasks/refine-description", post(refine_description))
}
