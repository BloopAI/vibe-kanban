-- Swarm Tasks Table
-- Stores tasks associated with a swarm

CREATE TABLE swarm_tasks (
    id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    sandbox_id TEXT,
    depends_on TEXT,       -- JSON array of task_ids
    triggers_after TEXT,   -- JSON array of task_ids
    result TEXT,
    error TEXT,
    tags TEXT,             -- JSON array of strings
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_swarm_tasks_swarm_id ON swarm_tasks(swarm_id);
CREATE INDEX idx_swarm_tasks_status ON swarm_tasks(status);
CREATE INDEX idx_swarm_tasks_priority ON swarm_tasks(priority);
CREATE INDEX idx_swarm_tasks_created_at ON swarm_tasks(created_at);
