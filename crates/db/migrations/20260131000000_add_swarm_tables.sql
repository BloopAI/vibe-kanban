-- Swarm Integration Tables
-- Migrates swarm backend (Node.js) into vibe-kanban (Rust)

-- ============================================
-- Table: swarms
-- ============================================
CREATE TABLE swarms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_swarms_project_id ON swarms(project_id);
CREATE INDEX idx_swarms_status ON swarms(status);

-- ============================================
-- Table: swarm_chat
-- ============================================
CREATE TABLE swarm_chat (
    id TEXT PRIMARY KEY,
    swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('system', 'user', 'sandbox')),
    sender_id TEXT,  -- sandbox_id when sender_type = 'sandbox'
    message TEXT NOT NULL,
    metadata TEXT,   -- JSON with extra data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_swarm_chat_swarm_id ON swarm_chat(swarm_id);
CREATE INDEX idx_swarm_chat_created_at ON swarm_chat(created_at);

-- ============================================
-- Table: sandboxes (pool tracking)
-- ============================================
CREATE TABLE sandboxes (
    id TEXT PRIMARY KEY,
    daytona_id TEXT NOT NULL,
    swarm_id TEXT REFERENCES swarms(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'destroyed')),
    current_task_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE INDEX idx_sandboxes_swarm_id ON sandboxes(swarm_id);
CREATE INDEX idx_sandboxes_status ON sandboxes(status);
CREATE INDEX idx_sandboxes_daytona_id ON sandboxes(daytona_id);

-- ============================================
-- Table: swarm_config
-- ============================================
CREATE TABLE swarm_config (
    id TEXT PRIMARY KEY DEFAULT 'default',

    -- Daytona
    daytona_api_url TEXT,
    daytona_api_key TEXT,  -- Should be encrypted in production

    -- Pool
    pool_max_sandboxes INTEGER DEFAULT 5,
    pool_idle_timeout_minutes INTEGER DEFAULT 10,
    pool_default_snapshot TEXT DEFAULT 'swarm-lite-v1',

    -- Claude
    anthropic_api_key TEXT,  -- Should be encrypted in production

    -- Skills
    skills_path TEXT DEFAULT '/root/.claude/skills',

    -- Git
    git_auto_commit INTEGER DEFAULT 1,  -- SQLite boolean
    git_auto_push INTEGER DEFAULT 0,
    git_token TEXT,  -- Should be encrypted in production

    -- Trigger Engine
    trigger_enabled INTEGER DEFAULT 1,
    trigger_poll_interval_seconds INTEGER DEFAULT 5,
    trigger_execution_timeout_minutes INTEGER DEFAULT 10,
    trigger_max_retries INTEGER DEFAULT 3,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config row
INSERT INTO swarm_config (id) VALUES ('default');

-- ============================================
-- Alter tasks table for swarm support
-- ============================================
ALTER TABLE tasks ADD COLUMN swarm_id TEXT REFERENCES swarms(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN sandbox_id TEXT;
ALTER TABLE tasks ADD COLUMN depends_on TEXT;      -- JSON array of task_ids
ALTER TABLE tasks ADD COLUMN triggers_after TEXT;  -- JSON array of task_ids
ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE tasks ADD COLUMN result TEXT;
ALTER TABLE tasks ADD COLUMN error TEXT;
ALTER TABLE tasks ADD COLUMN started_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP;

CREATE INDEX idx_tasks_swarm_id ON tasks(swarm_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
