-- Add PM Chat functionality
-- Replace pm_task_id approach with direct PM docs and conversation storage

-- Add pm_docs column to projects for storing generated specifications (Markdown)
ALTER TABLE projects ADD COLUMN pm_docs TEXT;

-- Create pm_conversations table for chat history
CREATE TABLE pm_conversations (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT,  -- The AI model used (for assistant messages)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups by project
CREATE INDEX idx_pm_conversations_project_id ON pm_conversations(project_id);
CREATE INDEX idx_pm_conversations_created_at ON pm_conversations(project_id, created_at);

-- Create pm_attachments table for file/image uploads
CREATE TABLE pm_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES pm_conversations(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,  -- Relative path to stored file
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    sha256 TEXT,  -- Optional hash for integrity verification
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for attachments
CREATE INDEX idx_pm_attachments_conversation_id ON pm_attachments(conversation_id);
CREATE INDEX idx_pm_attachments_project_id ON pm_attachments(project_id);

-- Note: We keep pm_task_id for backward compatibility but it will be deprecated
-- Existing pm_task_id data can be migrated to pm_docs if needed
