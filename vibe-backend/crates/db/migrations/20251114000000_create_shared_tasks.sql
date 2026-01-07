PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shared_tasks (
    id                  BLOB PRIMARY KEY,
    remote_project_id   BLOB NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo','inprogress','done','cancelled','inreview')),
    assignee_user_id    BLOB,
    assignee_first_name TEXT,
    assignee_last_name  TEXT,
    assignee_username   TEXT,
    version             INTEGER NOT NULL DEFAULT 1,
    last_event_seq      INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_remote_project
    ON shared_tasks (remote_project_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_status
    ON shared_tasks (status);

CREATE TABLE IF NOT EXISTS shared_activity_cursors (
    remote_project_id BLOB PRIMARY KEY,
    last_seq          INTEGER NOT NULL CHECK (last_seq >= 0),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

ALTER TABLE tasks
    ADD COLUMN shared_task_id BLOB REFERENCES shared_tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_shared_task_unique
    ON tasks(shared_task_id)
    WHERE shared_task_id IS NOT NULL;

ALTER TABLE projects
    ADD COLUMN remote_project_id BLOB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_remote_project_id
    ON projects(remote_project_id)
    WHERE remote_project_id IS NOT NULL;
