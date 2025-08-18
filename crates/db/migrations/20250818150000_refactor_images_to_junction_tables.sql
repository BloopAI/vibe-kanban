PRAGMA foreign_keys = ON;

-- Refactor images table to use junction tables for many-to-many relationships
-- This allows images to be associated with multiple tasks and execution processes
-- No data migration needed as there are no existing users of the image system

CREATE TABLE images (
    id                    BLOB PRIMARY KEY,
    file_path             TEXT NOT NULL,  -- relative path within cache/images/
    original_name         TEXT NOT NULL,
    mime_type             TEXT,
    size_bytes            INTEGER,
    hash                  TEXT NOT NULL UNIQUE,  -- SHA256 for deduplication
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Create junction table for task-image associations
CREATE TABLE task_images (
    id                    BLOB PRIMARY KEY,
    task_id               BLOB NOT NULL,
    image_id              BLOB NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    UNIQUE(task_id, image_id)  -- Prevent duplicate associations
);


-- Create indexes for efficient querying
CREATE INDEX idx_images_hash ON images(hash);
CREATE INDEX idx_task_images_task_id ON task_images(task_id);
CREATE INDEX idx_task_images_image_id ON task_images(image_id);
