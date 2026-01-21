-- 0. DROP SHARED TASKS
-- Remove the old shared_tasks table and related objects
DROP TABLE IF EXISTS shared_tasks CASCADE;
DROP TYPE IF EXISTS task_status;

-- 1. ENUMS
-- We define enums for fields with a fixed set of options
CREATE TYPE issue_priority AS ENUM ('urgent', 'high', 'medium', 'low');

-- 2. MODIFY EXISTING PROJECTS TABLE
-- Add color and updated_at columns, drop unused metadata column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '#000000';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE projects DROP COLUMN IF EXISTS metadata;

-- Add updated_at trigger for projects
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- 4. PROJECT STATUSES
-- Configurable statuses per project (Backlog, Todo, etc.)
CREATE TABLE project_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevents duplicate sort orders within the same project
    CONSTRAINT project_statuses_project_sort_order_uniq
        UNIQUE (project_id, sort_order)
);


-- 6. PROJECT NOTIFICATION PREFERENCES
CREATE TABLE project_notification_preferences (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    notify_on_issue_created BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_issue_assigned BOOLEAN NOT NULL DEFAULT TRUE,

    PRIMARY KEY (project_id, user_id)
);

-- 6. ISSUES
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Status inherits from project_statuses
    status_id UUID NOT NULL REFERENCES project_statuses(id),

    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority issue_priority NOT NULL DEFAULT 'medium',

    start_date TIMESTAMPTZ,
    target_date TIMESTAMPTZ,

    -- Completion status
    completed_at TIMESTAMPTZ, -- NULL means not completed

    -- Ordering in lists/kanban
    sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- Parent Issue (Self-referential)
    parent_issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,

    -- Extension Metadata (JSONB for flexibility)
    extension_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ISSUE ASSIGNEES (Team members)
CREATE TABLE issue_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issue_id, user_id)
);

-- 10. ISSUE FOLLOWERS
CREATE TABLE issue_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (issue_id, user_id)
);

-- 11. ISSUE RELATIONSHIPS
-- Links issues with different relationship types (blocking, related, duplicate)
CREATE TYPE issue_relationship_type AS ENUM ('blocking', 'related', 'has_duplicate');

CREATE TABLE issue_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    related_issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    relationship_type issue_relationship_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issue_id, related_issue_id, relationship_type),
    CHECK (issue_id != related_issue_id)
);

-- 12. TAGS
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL,

    UNIQUE (project_id, name)
);

CREATE TABLE issue_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE (issue_id, tag_id)
);

-- 13. COMMENTS
CREATE TABLE issue_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    message TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. COMMENT REACTIONS
CREATE TABLE issue_comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES issue_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    emoji VARCHAR(32) NOT NULL, -- Store the emoji character or shortcode
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One reaction type per user per comment
    UNIQUE (comment_id, user_id, emoji)
);

-- 15. NOTIFICATIONS
CREATE TYPE notification_type AS ENUM (
    'issue_comment_added',
    'issue_status_changed',
    'issue_assignee_changed',
    'issue_deleted'
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    notification_type notification_type NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',

    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES issue_comments(id) ON DELETE SET NULL,

    seen BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX idx_issues_project_id ON issues(project_id);
CREATE INDEX idx_issues_status_id ON issues(status_id);
CREATE INDEX idx_issues_parent_issue_id ON issues(parent_issue_id);
CREATE INDEX idx_issue_comments_issue_id ON issue_comments(issue_id);

CREATE INDEX idx_notifications_user_unseen
    ON notifications (user_id, seen)
    WHERE dismissed_at IS NULL;

CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_org
    ON notifications (organization_id);

-- 16. WORKSPACES
-- Workspace metadata pushed from local clients
CREATE TYPE workspace_pr_status AS ENUM ('open', 'merged', 'closed');

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    local_workspace_id UUID NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    files_changed INTEGER,
    lines_added INTEGER,
    lines_removed INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, repo_name)
);

CREATE TABLE workspace_prs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_repo_id UUID NOT NULL REFERENCES workspace_repos(id) ON DELETE CASCADE,
    pr_url TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    pr_status workspace_pr_status NOT NULL DEFAULT 'open',
    merged_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_repo_id)
);

CREATE INDEX idx_workspaces_project_id ON workspaces(project_id);
CREATE INDEX idx_workspaces_owner_user_id ON workspaces(owner_user_id);
CREATE INDEX idx_workspaces_issue_id ON workspaces(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX idx_workspaces_local_workspace_id ON workspaces(local_workspace_id);
CREATE INDEX idx_workspace_repos_workspace_id ON workspace_repos(workspace_id);
CREATE INDEX idx_workspace_prs_workspace_repo_id ON workspace_prs(workspace_repo_id);
