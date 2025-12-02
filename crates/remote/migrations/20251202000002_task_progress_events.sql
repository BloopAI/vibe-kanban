-- Task progress events from node execution
CREATE TABLE IF NOT EXISTS node_task_progress_events (
    id                  BIGSERIAL PRIMARY KEY,
    assignment_id       UUID NOT NULL REFERENCES node_task_assignments(id) ON DELETE CASCADE,
    event_type          TEXT NOT NULL,  -- 'agent_started', 'branch_created', 'committed', etc.
    message             TEXT,
    metadata            JSONB,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_progress_events_assignment ON node_task_progress_events(assignment_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_events_assignment_time ON node_task_progress_events(assignment_id, created_at);
