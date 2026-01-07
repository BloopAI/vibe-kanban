-- Create inbox_items table for notifications
CREATE TABLE inbox_items (
    id                  BLOB PRIMARY KEY,
    notification_type   TEXT NOT NULL DEFAULT 'task_assigned',
    title               TEXT NOT NULL,
    message             TEXT,
    task_id             BLOB,
    project_id          BLOB,
    workspace_id        BLOB,
    is_read             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

-- Create indexes for faster lookups
CREATE INDEX idx_inbox_items_is_read ON inbox_items(is_read);
CREATE INDEX idx_inbox_items_task_id ON inbox_items(task_id);
CREATE INDEX idx_inbox_items_project_id ON inbox_items(project_id);
CREATE INDEX idx_inbox_items_workspace_id ON inbox_items(workspace_id);
CREATE INDEX idx_inbox_items_created_at ON inbox_items(created_at DESC);
