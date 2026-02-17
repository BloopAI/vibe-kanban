-- Remove FK constraint from workspaces.task_id → tasks(id).
-- task_id column is preserved, just no longer FK-enforced.
-- This breaks the ON DELETE CASCADE so deleting a task no longer deletes workspaces.

-- sqlx workaround: end auto-transaction to allow PRAGMA to take effect
COMMIT;

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE workspaces_new (
    id                 BLOB PRIMARY KEY,
    task_id            BLOB,
    container_ref      TEXT,
    branch             TEXT NOT NULL,
    agent_working_dir  TEXT,
    setup_completed_at TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    archived           INTEGER NOT NULL DEFAULT 0,
    pinned             INTEGER NOT NULL DEFAULT 0,
    name               TEXT
);

INSERT INTO workspaces_new (id, task_id, container_ref, branch, agent_working_dir,
    setup_completed_at, created_at, updated_at, archived, pinned, name)
SELECT id, task_id, container_ref, branch, agent_working_dir,
    setup_completed_at, created_at, updated_at, archived, pinned, name
FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces_new RENAME TO workspaces;

-- Recreate indexes (from 20250917 + 20251219 migrations)
CREATE INDEX idx_workspaces_task_id_created_at
    ON workspaces (task_id, created_at DESC);
CREATE INDEX idx_workspaces_created_at
    ON workspaces (created_at DESC);
CREATE INDEX idx_workspaces_container_ref
    ON workspaces (container_ref) WHERE container_ref IS NOT NULL;

-- Verify foreign key constraints before committing
PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- Create junction table for workspace-image associations (mirrors task_images)
CREATE TABLE workspace_images (
    id                    BLOB PRIMARY KEY,
    workspace_id          BLOB NOT NULL,
    image_id              BLOB NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    UNIQUE(workspace_id, image_id)
);

CREATE INDEX idx_workspace_images_workspace_id ON workspace_images(workspace_id);
CREATE INDEX idx_workspace_images_image_id ON workspace_images(image_id);

-- Migrate existing task_images → workspace_images via workspaces.task_id
INSERT INTO workspace_images (id, workspace_id, image_id, created_at)
SELECT randomblob(16), w.id, ti.image_id, ti.created_at
FROM task_images ti
JOIN workspaces w ON w.task_id = ti.task_id;

-- sqlx workaround: start empty transaction for sqlx to close gracefully
BEGIN TRANSACTION;
