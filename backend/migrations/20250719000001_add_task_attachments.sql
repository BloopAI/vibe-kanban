-- Create task_attachments table to store uploaded files/images
CREATE TABLE task_attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_data BLOB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Index for querying attachments by task
CREATE INDEX idx_task_attachments_task_id ON task_attachments(task_id);