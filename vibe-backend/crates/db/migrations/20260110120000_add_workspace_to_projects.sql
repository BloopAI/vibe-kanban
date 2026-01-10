-- Add tenant_workspace_id to projects table for workspace scoping
-- This allows filtering projects by workspace

ALTER TABLE projects
    ADD COLUMN tenant_workspace_id UUID
    REFERENCES tenant_workspaces(id) ON DELETE SET NULL;

-- Index for efficient workspace filtering
CREATE INDEX idx_projects_tenant_workspace ON projects(tenant_workspace_id);

-- Comment for documentation
COMMENT ON COLUMN projects.tenant_workspace_id IS 'The tenant workspace this project belongs to. NULL means legacy project without workspace.';
