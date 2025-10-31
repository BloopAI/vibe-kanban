-- Add task_tags junction table for many-to-many relationship between tasks and tags

CREATE TABLE task_tags (
    task_id BLOB NOT NULL,
    tag_id  BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    PRIMARY KEY (task_id, tag_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Index for efficient tag-based task queries
CREATE INDEX idx_task_tags_tag_id ON task_tags(tag_id);

-- Index for efficient task-based tag queries
CREATE INDEX idx_task_tags_task_id ON task_tags(task_id);
