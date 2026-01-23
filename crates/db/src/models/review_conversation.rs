use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::user::User;

#[derive(Debug, Error)]
pub enum ReviewConversationError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Conversation not found")]
    NotFound,
    #[error("Message not found")]
    MessageNotFound,
    #[error("Conversation already resolved")]
    AlreadyResolved,
}

/// Side of the diff where the comment is anchored
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum DiffSide {
    Old,
    New,
}

impl DiffSide {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiffSide::Old => "old",
            DiffSide::New => "new",
        }
    }
}

impl TryFrom<&str> for DiffSide {
    type Error = String;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "old" => Ok(DiffSide::Old),
            "new" => Ok(DiffSide::New),
            _ => Err(format!("Invalid diff side: {}", s)),
        }
    }
}

/// A review conversation anchored to a specific line in a file
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReviewConversation {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub file_path: String,
    pub line_number: i64,
    pub side: String, // "old" or "new"
    pub code_line: Option<String>,
    pub is_resolved: bool,
    #[ts(type = "Date | null")]
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by_user_id: Option<Uuid>,
    pub resolution_summary: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// A message in a review conversation
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReviewConversationMessage {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub user_id: Option<Uuid>,
    pub content: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Compact representation of a user for conversation messages
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConversationUser {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
}

impl From<User> for ConversationUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
        }
    }
}

/// A message with its author's information
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct MessageWithAuthor {
    #[serde(flatten)]
    pub message: ReviewConversationMessage,
    pub author: Option<ConversationUser>,
}

/// A conversation with all its messages and user info
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ConversationWithMessages {
    #[serde(flatten)]
    pub conversation: ReviewConversation,
    pub messages: Vec<MessageWithAuthor>,
    pub resolved_by: Option<ConversationUser>,
}

/// Request to create a new conversation
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateConversation {
    pub file_path: String,
    pub line_number: i64,
    pub side: DiffSide,
    pub code_line: Option<String>,
    pub initial_message: String,
}

/// Request to add a message to a conversation
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateMessage {
    pub content: String,
}

/// Request to resolve a conversation
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct ResolveConversation {
    pub summary: String,
}

impl ReviewConversation {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, ReviewConversation>(
            r#"SELECT id, workspace_id, file_path, line_number, side, code_line,
                      is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                      created_at, updated_at
               FROM review_conversations
               WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Find all conversations for a workspace
    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ReviewConversation>(
            r#"SELECT id, workspace_id, file_path, line_number, side, code_line,
                      is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                      created_at, updated_at
               FROM review_conversations
               WHERE workspace_id = $1
               ORDER BY created_at ASC"#,
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await
    }

    /// Find all unresolved conversations for a workspace
    pub async fn find_unresolved_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ReviewConversation>(
            r#"SELECT id, workspace_id, file_path, line_number, side, code_line,
                      is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                      created_at, updated_at
               FROM review_conversations
               WHERE workspace_id = $1 AND is_resolved = 0
               ORDER BY created_at ASC"#,
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await
    }

    /// Find conversations by file path
    pub async fn find_by_file_path(
        pool: &SqlitePool,
        workspace_id: Uuid,
        file_path: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ReviewConversation>(
            r#"SELECT id, workspace_id, file_path, line_number, side, code_line,
                      is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                      created_at, updated_at
               FROM review_conversations
               WHERE workspace_id = $1 AND file_path = $2
               ORDER BY line_number ASC"#,
        )
        .bind(workspace_id)
        .bind(file_path)
        .fetch_all(pool)
        .await
    }

    /// Create a new conversation with an initial message
    pub async fn create(
        pool: &SqlitePool,
        workspace_id: Uuid,
        data: &CreateConversation,
        user_id: Option<Uuid>,
    ) -> Result<Self, ReviewConversationError> {
        let conversation_id = Uuid::new_v4();
        let message_id = Uuid::new_v4();
        let side_str = data.side.as_str();

        // Create the conversation
        let conversation: ReviewConversation = sqlx::query_as(
            r#"INSERT INTO review_conversations (id, workspace_id, file_path, line_number, side, code_line)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, workspace_id, file_path, line_number, side, code_line,
                         is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                         created_at, updated_at"#,
        )
        .bind(conversation_id)
        .bind(workspace_id)
        .bind(&data.file_path)
        .bind(data.line_number)
        .bind(side_str)
        .bind(&data.code_line)
        .fetch_one(pool)
        .await?;

        // Add the initial message
        sqlx::query(
            r#"INSERT INTO review_conversation_messages (id, conversation_id, user_id, content)
               VALUES ($1, $2, $3, $4)"#,
        )
        .bind(message_id)
        .bind(conversation_id)
        .bind(user_id)
        .bind(&data.initial_message)
        .execute(pool)
        .await?;

        Ok(conversation)
    }

    /// Resolve a conversation with a summary
    pub async fn resolve(
        pool: &SqlitePool,
        id: Uuid,
        user_id: Option<Uuid>,
        summary: &str,
    ) -> Result<Self, ReviewConversationError> {
        let result: Option<ReviewConversation> = sqlx::query_as(
            r#"UPDATE review_conversations
               SET is_resolved = 1,
                   resolved_at = datetime('now', 'subsec'),
                   resolved_by_user_id = $2,
                   resolution_summary = $3
               WHERE id = $1 AND is_resolved = 0
               RETURNING id, workspace_id, file_path, line_number, side, code_line,
                         is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                         created_at, updated_at"#,
        )
        .bind(id)
        .bind(user_id)
        .bind(summary)
        .fetch_optional(pool)
        .await?;

        result.ok_or(ReviewConversationError::NotFound)
    }

    /// Unresolve a conversation (re-open it)
    pub async fn unresolve(pool: &SqlitePool, id: Uuid) -> Result<Self, ReviewConversationError> {
        let result: Option<ReviewConversation> = sqlx::query_as(
            r#"UPDATE review_conversations
               SET is_resolved = 0,
                   resolved_at = NULL,
                   resolved_by_user_id = NULL,
                   resolution_summary = NULL
               WHERE id = $1
               RETURNING id, workspace_id, file_path, line_number, side, code_line,
                         is_resolved, resolved_at, resolved_by_user_id, resolution_summary,
                         created_at, updated_at"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        result.ok_or(ReviewConversationError::NotFound)
    }

    /// Delete a conversation and all its messages
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), ReviewConversationError> {
        let result = sqlx::query(r#"DELETE FROM review_conversations WHERE id = $1"#)
            .bind(id)
            .execute(pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(ReviewConversationError::NotFound);
        }
        Ok(())
    }

    /// Get the resolved_by user if one exists
    pub async fn get_resolved_by_user(
        &self,
        pool: &SqlitePool,
    ) -> Result<Option<User>, sqlx::Error> {
        match self.resolved_by_user_id {
            Some(user_id) => User::find_by_id(pool, user_id).await,
            None => Ok(None),
        }
    }

    /// Get diff side as enum
    pub fn diff_side(&self) -> Result<DiffSide, String> {
        DiffSide::try_from(self.side.as_str())
    }
}

impl ReviewConversationMessage {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, ReviewConversationMessage>(
            r#"SELECT id, conversation_id, user_id, content, created_at, updated_at
               FROM review_conversation_messages
               WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Find all messages for a conversation, ordered by creation time
    pub async fn find_by_conversation_id(
        pool: &SqlitePool,
        conversation_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, ReviewConversationMessage>(
            r#"SELECT id, conversation_id, user_id, content, created_at, updated_at
               FROM review_conversation_messages
               WHERE conversation_id = $1
               ORDER BY created_at ASC"#,
        )
        .bind(conversation_id)
        .fetch_all(pool)
        .await
    }

    /// Create a new message in a conversation
    pub async fn create(
        pool: &SqlitePool,
        conversation_id: Uuid,
        user_id: Option<Uuid>,
        content: &str,
    ) -> Result<Self, ReviewConversationError> {
        let message_id = Uuid::new_v4();

        // Verify conversation exists and is not resolved
        let conversation = ReviewConversation::find_by_id(pool, conversation_id).await?;
        match conversation {
            None => return Err(ReviewConversationError::NotFound),
            Some(c) if c.is_resolved => return Err(ReviewConversationError::AlreadyResolved),
            _ => {}
        }

        let message: ReviewConversationMessage = sqlx::query_as(
            r#"INSERT INTO review_conversation_messages (id, conversation_id, user_id, content)
               VALUES ($1, $2, $3, $4)
               RETURNING id, conversation_id, user_id, content, created_at, updated_at"#,
        )
        .bind(message_id)
        .bind(conversation_id)
        .bind(user_id)
        .bind(content)
        .fetch_one(pool)
        .await?;

        Ok(message)
    }

    /// Update a message's content
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        content: &str,
    ) -> Result<Self, ReviewConversationError> {
        let result: Option<ReviewConversationMessage> = sqlx::query_as(
            r#"UPDATE review_conversation_messages
               SET content = $2
               WHERE id = $1
               RETURNING id, conversation_id, user_id, content, created_at, updated_at"#,
        )
        .bind(id)
        .bind(content)
        .fetch_optional(pool)
        .await?;

        result.ok_or(ReviewConversationError::MessageNotFound)
    }

    /// Delete a message
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), ReviewConversationError> {
        let result = sqlx::query(r#"DELETE FROM review_conversation_messages WHERE id = $1"#)
            .bind(id)
            .execute(pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(ReviewConversationError::MessageNotFound);
        }
        Ok(())
    }

    /// Get the author user if one exists
    pub async fn get_author(&self, pool: &SqlitePool) -> Result<Option<User>, sqlx::Error> {
        match self.user_id {
            Some(user_id) => User::find_by_id(pool, user_id).await,
            None => Ok(None),
        }
    }

    /// Convert to MessageWithAuthor
    pub async fn with_author(self, pool: &SqlitePool) -> Result<MessageWithAuthor, sqlx::Error> {
        let author = self.get_author(pool).await?;
        Ok(MessageWithAuthor {
            message: self,
            author: author.map(ConversationUser::from),
        })
    }
}

/// Helper to load a conversation with all its messages and user info
pub async fn load_conversation_with_messages(
    pool: &SqlitePool,
    conversation_id: Uuid,
) -> Result<Option<ConversationWithMessages>, sqlx::Error> {
    let conversation = ReviewConversation::find_by_id(pool, conversation_id).await?;
    let conversation = match conversation {
        Some(c) => c,
        None => return Ok(None),
    };

    let messages =
        ReviewConversationMessage::find_by_conversation_id(pool, conversation_id).await?;
    let mut messages_with_authors = Vec::with_capacity(messages.len());

    for msg in messages {
        let author = msg.get_author(pool).await?;
        messages_with_authors.push(MessageWithAuthor {
            message: msg,
            author: author.map(ConversationUser::from),
        });
    }

    let resolved_by = conversation.get_resolved_by_user(pool).await?;

    Ok(Some(ConversationWithMessages {
        conversation,
        messages: messages_with_authors,
        resolved_by: resolved_by.map(ConversationUser::from),
    }))
}

/// Helper to load all conversations for a workspace with messages
pub async fn load_conversations_with_messages(
    pool: &SqlitePool,
    workspace_id: Uuid,
) -> Result<Vec<ConversationWithMessages>, sqlx::Error> {
    let conversations = ReviewConversation::find_by_workspace_id(pool, workspace_id).await?;
    let mut result = Vec::with_capacity(conversations.len());

    for conv in conversations {
        let messages = ReviewConversationMessage::find_by_conversation_id(pool, conv.id).await?;
        let mut messages_with_authors = Vec::with_capacity(messages.len());

        for msg in messages {
            let author = msg.get_author(pool).await?;
            messages_with_authors.push(MessageWithAuthor {
                message: msg,
                author: author.map(ConversationUser::from),
            });
        }

        let resolved_by = conv.get_resolved_by_user(pool).await?;

        result.push(ConversationWithMessages {
            conversation: conv,
            messages: messages_with_authors,
            resolved_by: resolved_by.map(ConversationUser::from),
        });
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_side_conversion() {
        assert_eq!(DiffSide::Old.as_str(), "old");
        assert_eq!(DiffSide::New.as_str(), "new");
        assert_eq!(DiffSide::try_from("old").unwrap(), DiffSide::Old);
        assert_eq!(DiffSide::try_from("new").unwrap(), DiffSide::New);
        assert!(DiffSide::try_from("invalid").is_err());
    }
}
