//! Review Conversations API
//!
//! Provides endpoints for managing threaded review conversations in the diff view.
//! Conversations are anchored to specific lines in files and support multiple messages
//! from different users. Conversations must be "resolved" before the agent turn can start.

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    response::Json as ResponseJson,
    routing::{delete, get, post},
};
use db::models::{
    review_conversation::{
        ConversationWithMessages, CreateConversation, CreateMessage, ResolveConversation,
        ReviewConversation, ReviewConversationError, ReviewConversationMessage,
        load_conversation_with_messages, load_conversations_with_messages,
    },
    workspace::Workspace,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::get_user_id_from_headers};

/// Response for creating a conversation (includes the initial message)
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct CreateConversationResponse {
    pub conversation: ConversationWithMessages,
}

/// Response for adding a message
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct AddMessageResponse {
    pub conversation: ConversationWithMessages,
}

/// Response for resolving a conversation
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ResolveConversationResponse {
    pub conversation: ConversationWithMessages,
}

/// Error types for conversation operations
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum ConversationError {
    NotFound,
    MessageNotFound,
    AlreadyResolved,
    ValidationError { message: String },
}

impl From<ReviewConversationError> for ConversationError {
    fn from(err: ReviewConversationError) -> Self {
        match err {
            ReviewConversationError::NotFound => ConversationError::NotFound,
            ReviewConversationError::MessageNotFound => ConversationError::MessageNotFound,
            ReviewConversationError::AlreadyResolved => ConversationError::AlreadyResolved,
            ReviewConversationError::Database(e) => ConversationError::ValidationError {
                message: e.to_string(),
            },
        }
    }
}

/// List all conversations for a workspace
#[axum::debug_handler]
pub async fn list_conversations(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ConversationWithMessages>>>, ApiError> {
    let pool = &deployment.db().pool;

    let conversations = load_conversations_with_messages(pool, workspace.id).await?;

    Ok(ResponseJson(ApiResponse::success(conversations)))
}

/// List only unresolved conversations for a workspace
#[axum::debug_handler]
pub async fn list_unresolved_conversations(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ConversationWithMessages>>>, ApiError> {
    let pool = &deployment.db().pool;

    let conversations =
        ReviewConversation::find_unresolved_by_workspace_id(pool, workspace.id).await?;

    // Load messages for each conversation
    let mut result = Vec::with_capacity(conversations.len());
    for conv in conversations {
        if let Some(cwm) = load_conversation_with_messages(pool, conv.id).await? {
            result.push(cwm);
        }
    }

    Ok(ResponseJson(ApiResponse::success(result)))
}

/// Get a single conversation by ID
#[axum::debug_handler]
pub async fn get_conversation(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Path(conversation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ConversationWithMessages, ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;

    let conversation = load_conversation_with_messages(pool, conversation_id).await?;

    match conversation {
        Some(c) if c.conversation.workspace_id == workspace.id => {
            Ok(ResponseJson(ApiResponse::success(c)))
        }
        _ => Ok(ResponseJson(ApiResponse::error_with_data(
            ConversationError::NotFound,
        ))),
    }
}

/// Create a new conversation with an initial message
#[axum::debug_handler]
pub async fn create_conversation(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
    Json(payload): Json<CreateConversation>,
) -> Result<ResponseJson<ApiResponse<CreateConversationResponse, ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;
    let user_id = get_user_id_from_headers(&deployment, &headers).await;

    // Validate the payload
    if payload.initial_message.trim().is_empty() {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            ConversationError::ValidationError {
                message: "Initial message cannot be empty".to_string(),
            },
        )));
    }

    let conversation = ReviewConversation::create(pool, workspace.id, &payload, user_id).await;

    match conversation {
        Ok(conv) => {
            // Load the full conversation with messages
            let full_conversation = load_conversation_with_messages(pool, conv.id)
                .await?
                .ok_or(ReviewConversationError::NotFound)?;

            deployment
                .track_if_analytics_allowed(
                    "review_conversation_created",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "file_path": payload.file_path,
                        "line_number": payload.line_number,
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(
                CreateConversationResponse {
                    conversation: full_conversation,
                },
            )))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error_with_data(e.into()))),
    }
}

/// Add a message to an existing conversation
#[axum::debug_handler]
pub async fn add_message(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Path(conversation_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<CreateMessage>,
) -> Result<ResponseJson<ApiResponse<AddMessageResponse, ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;
    let user_id = get_user_id_from_headers(&deployment, &headers).await;

    // Validate the payload
    if payload.content.trim().is_empty() {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            ConversationError::ValidationError {
                message: "Message content cannot be empty".to_string(),
            },
        )));
    }

    // Verify conversation exists and belongs to this workspace
    let existing = ReviewConversation::find_by_id(pool, conversation_id).await?;
    match existing {
        Some(c) if c.workspace_id != workspace.id => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        _ => {}
    }

    let result =
        ReviewConversationMessage::create(pool, conversation_id, user_id, &payload.content).await;

    match result {
        Ok(_) => {
            // Reload the full conversation
            let full_conversation = load_conversation_with_messages(pool, conversation_id)
                .await?
                .ok_or(ReviewConversationError::NotFound)?;

            deployment
                .track_if_analytics_allowed(
                    "review_conversation_message_added",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "conversation_id": conversation_id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(AddMessageResponse {
                conversation: full_conversation,
            })))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error_with_data(e.into()))),
    }
}

/// Resolve a conversation with a summary
#[axum::debug_handler]
pub async fn resolve_conversation(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Path(conversation_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<ResolveConversation>,
) -> Result<ResponseJson<ApiResponse<ResolveConversationResponse, ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;
    let user_id = get_user_id_from_headers(&deployment, &headers).await;

    // Verify conversation exists and belongs to this workspace
    let existing = ReviewConversation::find_by_id(pool, conversation_id).await?;
    match existing {
        Some(c) if c.workspace_id != workspace.id => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        _ => {}
    }

    let result =
        ReviewConversation::resolve(pool, conversation_id, user_id, &payload.summary).await;

    match result {
        Ok(_) => {
            // Reload the full conversation
            let full_conversation = load_conversation_with_messages(pool, conversation_id)
                .await?
                .ok_or(ReviewConversationError::NotFound)?;

            deployment
                .track_if_analytics_allowed(
                    "review_conversation_resolved",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "conversation_id": conversation_id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(
                ResolveConversationResponse {
                    conversation: full_conversation,
                },
            )))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error_with_data(e.into()))),
    }
}

/// Unresolve (re-open) a conversation
#[axum::debug_handler]
pub async fn unresolve_conversation(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Path(conversation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ResolveConversationResponse, ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify conversation exists and belongs to this workspace
    let existing = ReviewConversation::find_by_id(pool, conversation_id).await?;
    match existing {
        Some(c) if c.workspace_id != workspace.id => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        _ => {}
    }

    let result = ReviewConversation::unresolve(pool, conversation_id).await;

    match result {
        Ok(_) => {
            // Reload the full conversation
            let full_conversation = load_conversation_with_messages(pool, conversation_id)
                .await?
                .ok_or(ReviewConversationError::NotFound)?;

            deployment
                .track_if_analytics_allowed(
                    "review_conversation_unresolved",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "conversation_id": conversation_id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(
                ResolveConversationResponse {
                    conversation: full_conversation,
                },
            )))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error_with_data(e.into()))),
    }
}

/// Delete a conversation
#[axum::debug_handler]
pub async fn delete_conversation(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Path(conversation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<(), ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify conversation exists and belongs to this workspace
    let existing = ReviewConversation::find_by_id(pool, conversation_id).await?;
    match existing {
        Some(c) if c.workspace_id != workspace.id => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        _ => {}
    }

    let result = ReviewConversation::delete(pool, conversation_id).await;

    match result {
        Ok(()) => {
            deployment
                .track_if_analytics_allowed(
                    "review_conversation_deleted",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "conversation_id": conversation_id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error_with_data(e.into()))),
    }
}

/// Delete a message from a conversation
#[axum::debug_handler]
pub async fn delete_message(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Path((conversation_id, message_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<ConversationWithMessages, ConversationError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify conversation exists and belongs to this workspace
    let existing = ReviewConversation::find_by_id(pool, conversation_id).await?;
    match existing {
        Some(c) if c.workspace_id != workspace.id => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        Some(c) if c.is_resolved => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::AlreadyResolved,
            )));
        }
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::NotFound,
            )));
        }
        _ => {}
    }

    // Verify message belongs to this conversation
    let message = ReviewConversationMessage::find_by_id(pool, message_id).await?;
    match message {
        Some(m) if m.conversation_id != conversation_id => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::MessageNotFound,
            )));
        }
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                ConversationError::MessageNotFound,
            )));
        }
        _ => {}
    }

    let result = ReviewConversationMessage::delete(pool, message_id).await;

    match result {
        Ok(()) => {
            // Check if conversation has any messages left
            let remaining_messages =
                ReviewConversationMessage::find_by_conversation_id(pool, conversation_id).await?;

            if remaining_messages.is_empty() {
                // Delete the entire conversation if no messages remain
                ReviewConversation::delete(pool, conversation_id).await?;
                // Return an empty conversation to indicate deletion
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    ConversationError::NotFound,
                )));
            }

            // Reload the conversation
            let full_conversation = load_conversation_with_messages(pool, conversation_id)
                .await?
                .ok_or(ReviewConversationError::NotFound)?;

            Ok(ResponseJson(ApiResponse::success(full_conversation)))
        }
        Err(e) => Ok(ResponseJson(ApiResponse::error_with_data(e.into()))),
    }
}

/// Router for review conversations under /task-attempts/{id}/conversations
pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/", get(list_conversations).post(create_conversation))
        .route("/unresolved", get(list_unresolved_conversations))
        .route(
            "/{conversation_id}",
            get(get_conversation).delete(delete_conversation),
        )
        .route("/{conversation_id}/messages", post(add_message))
        .route(
            "/{conversation_id}/messages/{message_id}",
            delete(delete_message),
        )
        .route("/{conversation_id}/resolve", post(resolve_conversation))
        .route("/{conversation_id}/unresolve", post(unresolve_conversation))
}
