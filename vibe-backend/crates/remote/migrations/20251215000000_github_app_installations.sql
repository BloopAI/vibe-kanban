-- GitHub App installations linked to organizations
CREATE TABLE github_app_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    github_installation_id BIGINT NOT NULL UNIQUE,
    github_account_login TEXT NOT NULL,
    github_account_type TEXT NOT NULL,  -- 'Organization' or 'User'
    repository_selection TEXT NOT NULL, -- 'all' or 'selected'
    installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    suspended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_github_app_installations_org ON github_app_installations(organization_id);

-- Repositories accessible via an installation
CREATE TABLE github_app_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES github_app_installations(id) ON DELETE CASCADE,
    github_repo_id BIGINT NOT NULL,
    repo_full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(installation_id, github_repo_id)
);

CREATE INDEX idx_github_app_repos_installation ON github_app_repositories(installation_id);

-- Track pending installations (before callback completes)
CREATE TABLE github_app_pending_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pending_installations_state ON github_app_pending_installations(state_token);
CREATE INDEX idx_pending_installations_expires ON github_app_pending_installations(expires_at);
