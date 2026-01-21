-- Multiplayer Review Conversations
-- A conversation is a threaded discussion anchored to a specific line in a file during code review.
-- Conversations can have multiple messages from different users.
-- Conversations must be "resolved" before the agent turn can start.

-- Create conversations table
CREATE TABLE review_conversations (
    id BLOB PRIMARY KEY NOT NULL,
    workspace_id BLOB NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('old', 'new')),
    code_line TEXT, -- The code snippet at this line for context

    -- Resolution state
    is_resolved INTEGER NOT NULL DEFAULT 0, -- 0 = open, 1 = resolved
    resolved_at TEXT, -- datetime when resolved
    resolved_by_user_id BLOB REFERENCES users(id) ON DELETE SET NULL,
    resolution_summary TEXT, -- AI-generated summary of actionable takeaways

    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Create messages table for conversation replies
CREATE TABLE review_conversation_messages (
    id BLOB PRIMARY KEY NOT NULL,
    conversation_id BLOB NOT NULL REFERENCES review_conversations(id) ON DELETE CASCADE,
    user_id BLOB REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Indexes for efficient queries
CREATE INDEX idx_review_conversations_workspace_id ON review_conversations(workspace_id);
CREATE INDEX idx_review_conversations_file_path ON review_conversations(workspace_id, file_path);
CREATE INDEX idx_review_conversations_is_resolved ON review_conversations(workspace_id, is_resolved);
CREATE INDEX idx_review_conversation_messages_conversation_id ON review_conversation_messages(conversation_id);
CREATE INDEX idx_review_conversation_messages_user_id ON review_conversation_messages(user_id);

-- Trigger to update conversation's updated_at when messages are added
CREATE TRIGGER update_conversation_on_message_insert
AFTER INSERT ON review_conversation_messages
BEGIN
    UPDATE review_conversations
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.conversation_id;
END;

-- Trigger to update updated_at on conversation update
CREATE TRIGGER update_review_conversations_updated_at
AFTER UPDATE ON review_conversations
BEGIN
    UPDATE review_conversations
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id AND OLD.updated_at = NEW.updated_at;
END;

-- Trigger to update updated_at on message update
CREATE TRIGGER update_review_conversation_messages_updated_at
AFTER UPDATE ON review_conversation_messages
BEGIN
    UPDATE review_conversation_messages
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id AND OLD.updated_at = NEW.updated_at;
END;
