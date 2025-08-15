PRAGMA foreign_keys = ON;

-- Create images table for storing image metadata
CREATE TABLE images (
    id                    BLOB PRIMARY KEY,
    task_id               BLOB,  -- FK to tasks (for initial task images)
    execution_process_id  BLOB,  -- FK to execution_processes (for follow-up images)
    file_path             TEXT NOT NULL,  -- relative path within cache/images/
    original_name         TEXT NOT NULL,
    mime_type             TEXT,
    size_bytes            INTEGER,
    hash                  TEXT NOT NULL UNIQUE,  -- SHA256 for deduplication
    position              INTEGER DEFAULT 0,  -- for ordering multiple images
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE SET NULL,
    CHECK ((task_id IS NOT NULL AND execution_process_id IS NULL) OR 
           (task_id IS NULL AND execution_process_id IS NOT NULL) OR
           (task_id IS NULL AND execution_process_id IS NULL))
);

-- Create indexes for efficient querying
CREATE INDEX idx_images_task_id ON images(task_id);
CREATE INDEX idx_images_execution_process_id ON images(execution_process_id);
CREATE INDEX idx_images_hash ON images(hash);