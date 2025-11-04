PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shared_tasks (
    id                  BLOB PRIMARY KEY,
    organization_id     TEXT NOT NULL,
    project_id          BLOB,
    github_repo_id      INTEGER,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo','inprogress','done','cancelled','inreview')),
    assignee_user_id    TEXT,
    assignee_first_name TEXT,
    assignee_last_name  TEXT,
    assignee_username   TEXT,
    version             INTEGER NOT NULL DEFAULT 1,
    last_event_seq      INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_org
    ON shared_tasks (organization_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_status
    ON shared_tasks (status);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_project
    ON shared_tasks (project_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_github_repo
    ON shared_tasks (github_repo_id);

CREATE TABLE IF NOT EXISTS shared_activity_cursors (
    organization_id TEXT PRIMARY KEY,
    last_seq        INTEGER NOT NULL CHECK (last_seq >= 0),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

ALTER TABLE projects
    ADD COLUMN has_remote INTEGER NOT NULL DEFAULT 0;

ALTER TABLE projects
    ADD COLUMN github_repo_owner TEXT;

ALTER TABLE projects
    ADD COLUMN github_repo_name TEXT;

ALTER TABLE projects
    ADD COLUMN github_repo_id INTEGER;

-- Avoid a foreign key here so shared_task_id values persist even if shared_tasks is cleared.
ALTER TABLE tasks
    ADD COLUMN shared_task_id BLOB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_shared_task_unique
    ON tasks(shared_task_id)
    WHERE shared_task_id IS NOT NULL;
