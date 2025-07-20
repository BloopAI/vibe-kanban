-- Create table for diff comments
CREATE TABLE IF NOT EXISTS diff_comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    old_line_number INTEGER,
    new_line_number INTEGER,
    selection_start_line INTEGER NOT NULL,
    selection_end_line INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX idx_diff_comments_task_attempt ON diff_comments(task_id, attempt_id);
CREATE INDEX idx_diff_comments_status ON diff_comments(status);

-- Add trigger to update the updated_at timestamp
CREATE TRIGGER diff_comments_updated_at
AFTER UPDATE ON diff_comments
BEGIN
    UPDATE diff_comments
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;