-- Task output logs from node execution
CREATE TABLE IF NOT EXISTS node_task_output_logs (
    id                  BIGSERIAL PRIMARY KEY,
    assignment_id       UUID NOT NULL REFERENCES node_task_assignments(id) ON DELETE CASCADE,
    output_type         TEXT NOT NULL,  -- 'stdout', 'stderr', 'system'
    content             TEXT NOT NULL,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_output_logs_assignment ON node_task_output_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_task_output_logs_assignment_time ON node_task_output_logs(assignment_id, created_at);
