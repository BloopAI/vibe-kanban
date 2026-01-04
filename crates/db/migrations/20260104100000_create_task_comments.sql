-- Task comments for Jira-style commenting functionality
CREATE TABLE task_comments (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    content TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_author_id ON task_comments(author_id);
CREATE INDEX idx_task_comments_created_at ON task_comments(task_id, created_at);
