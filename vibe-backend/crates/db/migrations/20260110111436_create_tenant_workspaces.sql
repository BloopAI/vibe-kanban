-- Create tenant_workspaces table (top-level organizational unit)
-- This is the tenant container for multi-tenancy - each workspace is an isolated organization

CREATE TABLE IF NOT EXISTS tenant_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    color TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create tenant_workspace_members table (who has access to which workspace)
CREATE TABLE IF NOT EXISTS tenant_workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_workspace_id, user_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tenant_workspaces_slug ON tenant_workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_workspace_members_workspace ON tenant_workspace_members(tenant_workspace_id);
CREATE INDEX IF NOT EXISTS idx_tenant_workspace_members_user ON tenant_workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_workspace_members_email ON tenant_workspace_members(email);

-- Add workspace_id to teams table (optional - for scoping teams to workspaces)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tenant_workspace_id UUID REFERENCES tenant_workspaces(id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_workspace ON teams(tenant_workspace_id);

-- Add workspace_id to projects table (optional - for scoping projects to workspaces)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_workspace_id UUID REFERENCES tenant_workspaces(id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_workspace ON projects(tenant_workspace_id);

-- Comments for documentation
COMMENT ON TABLE tenant_workspaces IS 'Top-level organizational workspaces (tenants) for multi-tenancy';
COMMENT ON TABLE tenant_workspace_members IS 'Members belonging to tenant workspaces with role-based access';
COMMENT ON COLUMN tenant_workspaces.slug IS 'URL-friendly unique identifier (e.g., acme-corp)';
COMMENT ON COLUMN tenant_workspaces.settings IS 'JSON configuration for workspace-level settings';
COMMENT ON COLUMN tenant_workspace_members.role IS 'Member role: owner, admin, or member';
