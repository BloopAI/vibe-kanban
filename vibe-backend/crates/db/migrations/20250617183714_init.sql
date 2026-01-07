PRAGMA foreign_keys = ON;

CREATE TABLE projects (
    id            BLOB PRIMARY KEY,
    name          TEXT NOT NULL,
    git_repo_path TEXT NOT NULL DEFAULT '' UNIQUE,
    setup_script  TEXT DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE TABLE tasks (
    id          BLOB PRIMARY KEY,
    project_id  BLOB NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo','inprogress','done','cancelled','inreview')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE task_attempts (
    id            BLOB PRIMARY KEY,
    task_id       BLOB NOT NULL,
    worktree_path TEXT NOT NULL,
    merge_commit  TEXT,
    executor      TEXT,
    stdout        TEXT,
    stderr        TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE task_attempt_activities (
    id              BLOB PRIMARY KEY,
    task_attempt_id BLOB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'init'
                       CHECK (status IN ('init','setuprunning','setupcomplete','setupfailed','executorrunning','executorcomplete','executorfailed','paused')),    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);
