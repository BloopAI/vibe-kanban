-- Create attachments table for storing file metadata
CREATE TABLE attachments (
    id BLOB PRIMARY KEY NOT NULL,
    task_id BLOB NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Index for faster task attachment lookups
CREATE INDEX idx_attachments_task_id ON attachments(task_id);