-- Refactor task_attempts into workspaces and sessions
-- - Rename task_attempts -> workspaces (keeps workspace-related fields)
-- - Create sessions table (executor moves here)
-- - Update execution_processes.task_attempt_id -> session_id
-- - Rename executor_sessions -> coding_agent_turns (drop redundant task_attempt_id)
-- - Rename merges.task_attempt_id -> workspace_id
-- - Rename tasks.parent_task_attempt -> parent_workspace_id

-- 1. Rename task_attempts to workspaces (FK refs auto-update in schema)
ALTER TABLE task_attempts RENAME TO workspaces;

-- 2. Create sessions table
CREATE TABLE sessions (
    id              BLOB PRIMARY KEY,
    workspace_id    BLOB NOT NULL,
    executor        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);

-- 3. Migrate data: create one session per workspace
INSERT INTO sessions (id, workspace_id, executor, created_at, updated_at)
SELECT randomblob(16), id, executor, created_at, updated_at FROM workspaces;

-- 4. Drop executor column from workspaces
ALTER TABLE workspaces DROP COLUMN executor;

-- 5. Rename merges.task_attempt_id to workspace_id
DROP INDEX idx_merges_task_attempt_id;
DROP INDEX idx_merges_open_pr;
ALTER TABLE merges RENAME COLUMN task_attempt_id TO workspace_id;
CREATE INDEX idx_merges_workspace_id ON merges(workspace_id);
CREATE INDEX idx_merges_open_pr ON merges(workspace_id, pr_status)
WHERE merge_type = 'pr' AND pr_status = 'open';

-- 6. Rename tasks.parent_task_attempt to parent_workspace_id
DROP INDEX IF EXISTS idx_tasks_parent_task_attempt;
ALTER TABLE tasks RENAME COLUMN parent_task_attempt TO parent_workspace_id;
CREATE INDEX idx_tasks_parent_workspace_id ON tasks(parent_workspace_id);

-- Steps 7-8 need FK disabled to avoid cascade deletes during DROP TABLE
-- sqlx workaround: end auto-transaction to allow PRAGMA to take effect
-- https://github.com/launchbadge/sqlx/issues/2085#issuecomment-1499859906
COMMIT;

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 7. Update execution_processes to reference session_id instead of task_attempt_id
-- (needs rebuild because FK target changes from workspaces to sessions)
DROP INDEX IF EXISTS idx_execution_processes_task_attempt_created_at;
DROP INDEX IF EXISTS idx_execution_processes_task_attempt_type_created;

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

-- Join through sessions to get the correct session_id for each execution_process
INSERT INTO execution_processes_new (id, session_id, run_reason, executor_action, status, exit_code, dropped, started_at, completed_at, created_at, updated_at)
SELECT ep.id, s.id, ep.run_reason, ep.executor_action, ep.status, ep.exit_code, ep.dropped, ep.started_at, ep.completed_at, ep.created_at, ep.updated_at
FROM execution_processes ep
JOIN sessions s ON ep.task_attempt_id = s.workspace_id;

DROP TABLE execution_processes;
ALTER TABLE execution_processes_new RENAME TO execution_processes;

-- Recreate execution_processes indexes
CREATE INDEX idx_execution_processes_session_id ON execution_processes(session_id);
CREATE INDEX idx_execution_processes_status ON execution_processes(status);
CREATE INDEX idx_execution_processes_run_reason ON execution_processes(run_reason);

-- Composite indexes for Task::find_by_project_id_with_attempt_status query optimization
CREATE INDEX idx_execution_processes_session_status_run_reason
ON execution_processes (session_id, status, run_reason);

CREATE INDEX idx_execution_processes_session_run_reason_created
ON execution_processes (session_id, run_reason, created_at DESC);

-- 8. Rename executor_sessions to coding_agent_turns and drop task_attempt_id
-- (needs rebuild to drop the redundant task_attempt_id column)
-- Also rename session_id to agent_session_id for clarity
CREATE TABLE coding_agent_turns (
    id                    BLOB PRIMARY KEY,
    execution_process_id  BLOB NOT NULL,
    agent_session_id      TEXT,
    prompt                TEXT,
    summary               TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

INSERT INTO coding_agent_turns (id, execution_process_id, agent_session_id, prompt, summary, created_at, updated_at)
SELECT id, execution_process_id, session_id, prompt, summary, created_at, updated_at
FROM executor_sessions;

DROP TABLE executor_sessions;

-- Recreate coding_agent_turns indexes
CREATE INDEX idx_coding_agent_turns_execution_process_id ON coding_agent_turns(execution_process_id);
CREATE INDEX idx_coding_agent_turns_agent_session_id ON coding_agent_turns(agent_session_id);

-- 9. Rename attempt_repos to workspace_repos and attempt_id to workspace_id
ALTER TABLE attempt_repos RENAME TO workspace_repos;
ALTER TABLE workspace_repos RENAME COLUMN attempt_id TO workspace_id;
DROP INDEX idx_attempt_repos_attempt_id;
DROP INDEX idx_attempt_repos_repo_id;
CREATE INDEX idx_workspace_repos_workspace_id ON workspace_repos(workspace_id);
CREATE INDEX idx_workspace_repos_repo_id ON workspace_repos(repo_id);

-- Verify foreign key constraints before committing
PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- sqlx workaround: start empty transaction for sqlx to close gracefully
BEGIN TRANSACTION;
