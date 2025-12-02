-- Node status enum
DO $$
BEGIN
    CREATE TYPE node_status AS ENUM (
        'pending',      -- Registered but never connected
        'online',       -- Connected and healthy
        'offline',      -- Disconnected
        'busy',         -- Executing task(s)
        'draining'      -- No new work, finishing current
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- API keys for node authentication (machine-to-machine)
CREATE TABLE IF NOT EXISTS node_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    key_hash        TEXT NOT NULL,  -- SHA256 hash of API key
    key_prefix      TEXT NOT NULL,  -- First 8 chars for identification
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_api_keys_org ON node_api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_node_api_keys_prefix ON node_api_keys(key_prefix);

-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    machine_id          TEXT NOT NULL,  -- Stable hash of hostname/uuid
    status              node_status NOT NULL DEFAULT 'pending',
    capabilities        JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Connection info
    public_url          TEXT,           -- e.g., "http://192.168.1.50:3000"
    last_heartbeat_at   TIMESTAMPTZ,
    connected_at        TIMESTAMPTZ,
    disconnected_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_nodes_org_status ON nodes(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_nodes_heartbeat ON nodes(last_heartbeat_at)
    WHERE status IN ('online', 'busy');

-- Node-project links
CREATE TABLE IF NOT EXISTS node_projects (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id             UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    local_project_id    UUID NOT NULL,  -- Node's SQLite project ID
    git_repo_path       TEXT NOT NULL,
    default_branch      TEXT NOT NULL DEFAULT 'main',
    sync_status         TEXT NOT NULL DEFAULT 'pending',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, local_project_id),
    UNIQUE (project_id)  -- One node per project for Phase 1
);

CREATE INDEX IF NOT EXISTS idx_node_projects_node ON node_projects(node_id);
CREATE INDEX IF NOT EXISTS idx_node_projects_project ON node_projects(project_id);

-- Task-node assignments (tracks execution location)
CREATE TABLE IF NOT EXISTS node_task_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id             UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
    node_id             UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    node_project_id     UUID NOT NULL REFERENCES node_projects(id) ON DELETE CASCADE,
    local_task_id       UUID,           -- Node's SQLite task ID
    local_attempt_id    UUID,           -- Node's SQLite attempt ID
    execution_status    TEXT NOT NULL DEFAULT 'pending',
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_active
    ON node_task_assignments(task_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_assignments_node ON node_task_assignments(node_id);

-- Triggers for updated_at
CREATE TRIGGER trg_nodes_updated_at
    BEFORE UPDATE ON nodes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
