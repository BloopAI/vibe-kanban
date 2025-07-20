use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde_json::json;
use crate::{
    app_state::AppState,
    models::{
        diff_comment::{
            CreateDiffCommentRequest, DiffComment, SubmitDraftCommentsRequest,
            UpdateDiffCommentRequest,
        },
        ApiResponse,
    },
    services::process_service::ProcessService,
};

pub fn diff_comments_router() -> Router<AppState> {
    Router::new()
        .route("/diff-comments", post(create_diff_comment))
        .route("/diff-comments/:id", get(get_diff_comment))
        .route("/diff-comments/:id", patch(update_diff_comment))
        .route("/diff-comments/:id", delete(delete_diff_comment))
        .route(
            "/tasks/:task_id/attempts/:attempt_id/diff-comments",
            get(list_diff_comments),
        )
        .route(
            "/tasks/:task_id/attempts/:attempt_id/diff-comments/draft",
            get(list_draft_comments),
        )
        .route("/diff-comments/submit", post(submit_draft_comments))
}

pub async fn create_diff_comment(
    State(state): State<AppState>,
    Json(request): Json<CreateDiffCommentRequest>,
) -> Result<ResponseJson<ApiResponse<DiffComment>>, StatusCode> {
    match DiffComment::create(&state.db_pool, request).await {
        Ok(comment) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(comment),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to create diff comment: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_diff_comment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<ResponseJson<ApiResponse<DiffComment>>, StatusCode> {
    match DiffComment::get_by_id(&state.db_pool, &id).await {
        Ok(Some(comment)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(comment),
            message: None,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to get diff comment: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn list_diff_comments(
    State(state): State<AppState>,
    Path((task_id, attempt_id)): Path<(String, String)>,
) -> Result<ResponseJson<ApiResponse<Vec<DiffComment>>>, StatusCode> {
    match DiffComment::list_by_attempt(&state.db_pool, &task_id, &attempt_id).await {
        Ok(comments) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(comments),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to list diff comments: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn list_draft_comments(
    State(state): State<AppState>,
    Path((task_id, attempt_id)): Path<(String, String)>,
) -> Result<ResponseJson<ApiResponse<Vec<DiffComment>>>, StatusCode> {
    match DiffComment::list_draft_comments(&state.db_pool, &task_id, &attempt_id).await {
        Ok(comments) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(comments),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to list draft comments: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_diff_comment(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UpdateDiffCommentRequest>,
) -> Result<ResponseJson<ApiResponse<DiffComment>>, StatusCode> {
    match DiffComment::update(&state.db_pool, &id, request).await {
        Ok(comment) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(comment),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to update diff comment: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_diff_comment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<ResponseJson<ApiResponse<serde_json::Value>>, StatusCode> {
    match DiffComment::delete(&state.db_pool, &id).await {
        Ok(_) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(json!({ "id": id })),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to delete diff comment: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn submit_draft_comments(
    State(state): State<AppState>,
    Json(request): Json<SubmitDraftCommentsRequest>,
) -> Result<ResponseJson<ApiResponse<serde_json::Value>>, StatusCode> {
    // First submit the comments
    let comments = match DiffComment::submit_draft_comments(&state.db_pool, request.comment_ids.clone()).await {
        Ok(comments) => comments,
        Err(e) => {
            tracing::error!("Failed to submit draft comments: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Use the formatted prompt from frontend if provided, otherwise generate it
    let prompt = if let Some(formatted_prompt) = request.formatted_prompt {
        tracing::info!("Using formatted prompt from frontend: {}", formatted_prompt);
        formatted_prompt
    } else {
        match DiffComment::get_combined_prompt(&state.db_pool, request.comment_ids).await {
            Ok(prompt) => {
                tracing::info!("Generated prompt for diff comments: {}", prompt);
                prompt
            },
            Err(e) => {
                tracing::error!("Failed to get combined prompt: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    };

    // If no comments were submitted, return early
    if comments.is_empty() {
        return Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(json!({
                "comments": comments,
                "prompt": prompt,
                "execution_started": false
            })),
            message: None,
        }));
    }

    // Check if we should auto-execute
    let auto_execute = request.auto_execute.unwrap_or(false);
    let mut execution_started = false;
    let mut execution_message = None;

    if auto_execute && !comments.is_empty() {
        // Get task and attempt info from the first comment
        let first_comment = &comments[0];
        let task_id = first_comment.task_id;
        let attempt_id = first_comment.attempt_id;
        let project_id = first_comment.project_id;

        // Try to start a follow-up execution
        tracing::info!("Starting follow-up execution with prompt: {}", prompt);
        match ProcessService::start_followup_execution(
            &state.db_pool,
            &state,
            attempt_id,
            task_id,
            project_id,
            &prompt,
        ).await {
            Ok(actual_attempt_id) => {
                execution_started = true;
                execution_message = Some(format!(
                    "Follow-up execution started successfully on attempt {}",
                    actual_attempt_id
                ));
                tracing::info!(
                    "Started follow-up execution for diff comments on attempt {}",
                    actual_attempt_id
                );
            }
            Err(e) => {
                tracing::error!(
                    "Failed to start follow-up execution for diff comments: {}",
                    e
                );
                execution_message = Some(format!(
                    "Failed to start follow-up execution: {}",
                    e
                ));
            }
        }
    }

    Ok(ResponseJson(ApiResponse {
        success: true,
        data: Some(json!({
            "comments": comments,
            "prompt": prompt,
            "execution_started": execution_started,
            "execution_message": execution_message
        })),
        message: None,
    }))
}