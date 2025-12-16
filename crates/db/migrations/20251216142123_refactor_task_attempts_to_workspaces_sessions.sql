-- Refactor task_attempts into workspaces and sessions
-- - Rename task_attempts -> workspaces (keeps workspace-related fields)
-- - Create sessions table (executor moves here)
-- - Update execution_processes.task_attempt_id -> session_id
-- - Rename executor_sessions -> coding_agent_turns (drop redundant task_attempt_id)
-- - Update merges.task_attempt_id -> workspace_id
-- - Update tasks.parent_task_attempt -> parent_workspace_id

PRAGMA foreign_keys = OFF;

-- 1. Rename task_attempts to workspaces
ALTER TABLE task_attempts RENAME TO workspaces;

-- 2. Create sessions table
CREATE TABLE sessions (
    id              BLOB PRIMARY KEY,
    workspace_id    BLOB NOT NULL,
    executor        TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);

-- 3. Migrate data: create one session per workspace (using workspace.id as session.id for simplicity)
INSERT INTO sessions (id, workspace_id, executor, created_at, updated_at)
SELECT id, id, executor, created_at, updated_at FROM workspaces;

-- 4. Drop executor column from workspaces (SQLite requires table rebuild)
CREATE TABLE workspaces_new (
    id                  BLOB PRIMARY KEY,
    task_id             BLOB NOT NULL,
    container_ref       TEXT,
    branch              TEXT NOT NULL,
    setup_completed_at  TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

INSERT INTO workspaces_new (id, task_id, container_ref, branch, setup_completed_at, created_at, updated_at)
SELECT id, task_id, container_ref, branch, setup_completed_at, created_at, updated_at FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces_new RENAME TO workspaces;

-- Recreate workspace indexes
CREATE INDEX idx_workspaces_task_id ON workspaces(task_id);
CREATE INDEX idx_workspaces_container_ref ON workspaces(container_ref);

-- 5. Update execution_processes to reference session_id instead of task_attempt_id
CREATE TABLE execution_processes_new (
    id              BLOB PRIMARY KEY,
    session_id      BLOB NOT NULL,
    run_reason      TEXT NOT NULL DEFAULT 'setupscript'
                       CHECK (run_reason IN ('setupscript','codingagent','devserver','cleanupscript')),
    executor_action TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running','completed','failed','killed')),
    exit_code       INTEGER,
    dropped         INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    completed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Since we used workspace.id as session.id, the task_attempt_id values map directly
INSERT INTO execution_processes_new (id, session_id, run_reason, executor_action, status, exit_code, dropped, started_at, completed_at, created_at, updated_at)
SELECT id, task_attempt_id, run_reason, executor_action, status, exit_code, dropped, started_at, completed_at, created_at, updated_at
FROM execution_processes;

DROP TABLE execution_processes;
ALTER TABLE execution_processes_new RENAME TO execution_processes;

-- Recreate execution_processes indexes
CREATE INDEX idx_execution_processes_session_id ON execution_processes(session_id);
CREATE INDEX idx_execution_processes_status ON execution_processes(status);
CREATE INDEX idx_execution_processes_run_reason ON execution_processes(run_reason);

-- 6. Rename executor_sessions to coding_agent_turns and drop task_attempt_id
CREATE TABLE coding_agent_turns (
    id                    BLOB PRIMARY KEY,
    execution_process_id  BLOB NOT NULL,
    session_id            TEXT,
    prompt                TEXT,
    summary               TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

INSERT INTO coding_agent_turns (id, execution_process_id, session_id, prompt, summary, created_at, updated_at)
SELECT id, execution_process_id, session_id, prompt, summary, created_at, updated_at
FROM executor_sessions;

DROP TABLE executor_sessions;

-- Recreate coding_agent_turns indexes
CREATE INDEX idx_coding_agent_turns_execution_process_id ON coding_agent_turns(execution_process_id);
CREATE INDEX idx_coding_agent_turns_session_id ON coding_agent_turns(session_id);

-- 7. Update attempt_repos FK (column stays as attempt_id, FK target changes to workspaces)
CREATE TABLE attempt_repos_new (
    id            BLOB PRIMARY KEY,
    attempt_id    BLOB NOT NULL,
    repo_id       BLOB NOT NULL,
    target_branch TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (attempt_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
    UNIQUE (attempt_id, repo_id)
);

INSERT INTO attempt_repos_new SELECT * FROM attempt_repos;
DROP TABLE attempt_repos;
ALTER TABLE attempt_repos_new RENAME TO attempt_repos;

CREATE INDEX idx_attempt_repos_attempt_id ON attempt_repos(attempt_id);
CREATE INDEX idx_attempt_repos_repo_id ON attempt_repos(repo_id);

-- 8. Update merges table - rename task_attempt_id to workspace_id
CREATE TABLE merges_new (
    id                  BLOB PRIMARY KEY,
    workspace_id        BLOB NOT NULL,
    merge_type          TEXT NOT NULL CHECK (merge_type IN ('direct', 'pr')),
    merge_commit        TEXT,
    pr_number           INTEGER,
    pr_url              TEXT,
    pr_status           TEXT CHECK (pr_status IN ('open', 'merged', 'closed')),
    pr_merged_at        TEXT,
    pr_merge_commit_sha TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    target_branch_name  TEXT NOT NULL,
    repo_id             BLOB NOT NULL,
    CHECK (
        (merge_type = 'direct' AND merge_commit IS NOT NULL
         AND pr_number IS NULL AND pr_url IS NULL)
        OR
        (merge_type = 'pr' AND pr_number IS NOT NULL AND pr_url IS NOT NULL
         AND pr_status IS NOT NULL AND merge_commit IS NULL)
    ),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
);

INSERT INTO merges_new (id, workspace_id, merge_type, merge_commit, pr_number, pr_url, pr_status, pr_merged_at, pr_merge_commit_sha, created_at, target_branch_name, repo_id)
SELECT id, task_attempt_id, merge_type, merge_commit, pr_number, pr_url, pr_status, pr_merged_at, pr_merge_commit_sha, created_at, target_branch_name, repo_id
FROM merges;

DROP TABLE merges;
ALTER TABLE merges_new RENAME TO merges;

CREATE INDEX idx_merges_workspace_id ON merges(workspace_id);
CREATE INDEX idx_merges_repo_id ON merges(repo_id);
CREATE INDEX idx_merges_open_pr ON merges(workspace_id, pr_status)
WHERE merge_type = 'pr' AND pr_status = 'open';

-- 9. Update tasks table - rename parent_task_attempt to parent_workspace_id
-- Note: shared_task_id has no FK constraint since shared_tasks table was dropped in electric migration
CREATE TABLE tasks_new (
    id                  BLOB PRIMARY KEY,
    project_id          BLOB NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'todo'
                           CHECK (status IN ('todo','inprogress','inreview','done','cancelled')),
    parent_workspace_id BLOB,
    shared_task_id      BLOB,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_workspace_id) REFERENCES workspaces(id)
);

INSERT INTO tasks_new (id, project_id, title, description, status, parent_workspace_id, shared_task_id, created_at, updated_at)
SELECT id, project_id, title, description, status, parent_task_attempt, shared_task_id, created_at, updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_parent_workspace_id ON tasks(parent_workspace_id);
CREATE INDEX idx_tasks_shared_task_id ON tasks(shared_task_id);

PRAGMA foreign_keys = ON;
