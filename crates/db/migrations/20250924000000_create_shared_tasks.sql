PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shared_tasks (
    id                 BLOB PRIMARY KEY,
    organization_id    BLOB NOT NULL,
    project_id         BLOB NOT NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    status             TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo','inprogress','done','cancelled','inreview')),
    assignee_member_id BLOB,
    version            INTEGER NOT NULL DEFAULT 1,
    last_event_seq     INTEGER,
    created_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_org
    ON shared_tasks (organization_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_status
    ON shared_tasks (status);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_project
    ON shared_tasks (project_id);

CREATE TABLE IF NOT EXISTS shared_activity_cursors (
    organization_id BLOB PRIMARY KEY,
    last_seq        INTEGER NOT NULL CHECK (last_seq >= 0),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);
