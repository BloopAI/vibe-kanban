-- 1. ENUMS
-- We define enums for fields with a fixed set of options
CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');

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
    
    notify_on_task_created BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_task_assigned BOOLEAN NOT NULL DEFAULT TRUE,
    
    PRIMARY KEY (project_id, user_id)
);

-- 6. TASKS
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Status inherits from project_statuses
    status_id UUID NOT NULL REFERENCES project_statuses(id),

    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority task_priority NOT NULL DEFAULT 'medium',
    
    start_date TIMESTAMPTZ,
    target_date TIMESTAMPTZ,
    
    -- Completion status
    completed_at TIMESTAMPTZ, -- NULL means not completed
    
    -- Ordering in lists/kanban
    sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
    
    -- Parent Task (Self-referential)
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Extension Metadata (JSONB for flexibility)
    extension_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TASK ASSIGNEES (Team members)
CREATE TABLE task_assignees (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (task_id, user_id)
);

-- 10. TASK FOLLOWERS
CREATE TABLE task_followers (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

-- 11. TASK DEPENDENCIES (Blocked By)
-- NOTE: Application logic must validate against circular dependencies before inserting.
CREATE TABLE task_dependencies (
    blocking_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    blocked_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (blocking_task_id, blocked_task_id),
    -- Prevent a task from blocking itself
    CONSTRAINT no_self_block CHECK (blocking_task_id != blocked_task_id)
);

-- 12. TAGS
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL,
    
    UNIQUE (project_id, name)
);

CREATE TABLE task_tags (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

-- 13. COMMENTS
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    message TEXT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. COMMENT REACTIONS
CREATE TABLE task_comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    emoji VARCHAR(32) NOT NULL, -- Store the emoji character or shortcode
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One reaction type per user per comment
    UNIQUE (comment_id, user_id, emoji)
);

-- 15. NOTIFICATIONS
CREATE TYPE notification_type AS ENUM (
    'task_comment_added',
    'task_status_changed',
    'task_assignee_changed',
    'task_deleted'
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    notification_type notification_type NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',

    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES task_comments(id) ON DELETE SET NULL,

    seen BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status_id ON tasks(status_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);

CREATE INDEX idx_notifications_user_unseen
    ON notifications (user_id, seen)
    WHERE dismissed_at IS NULL;

CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_org
    ON notifications (organization_id);

-- 16. REMOTE WORKSPACES
-- Workspace metadata pushed from local clients
CREATE TYPE workspace_pr_status AS ENUM ('open', 'merged', 'closed');

CREATE TABLE remote_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    local_workspace_id UUID NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    files_changed INTEGER,
    lines_added INTEGER,
    lines_removed INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE remote_workspace_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES remote_workspaces(id) ON DELETE CASCADE,
    repo_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, repo_name)
);

CREATE TABLE remote_workspace_prs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_repo_id UUID NOT NULL REFERENCES remote_workspace_repos(id) ON DELETE CASCADE,
    pr_url TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    pr_status workspace_pr_status NOT NULL DEFAULT 'open',
    merged_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_repo_id)
);

CREATE INDEX idx_remote_workspaces_organization_id ON remote_workspaces(organization_id);
CREATE INDEX idx_remote_workspaces_owner_user_id ON remote_workspaces(owner_user_id);
CREATE INDEX idx_remote_workspaces_task_id ON remote_workspaces(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_remote_workspaces_local_workspace_id ON remote_workspaces(local_workspace_id);
CREATE INDEX idx_remote_workspace_repos_workspace_id ON remote_workspace_repos(workspace_id);
CREATE INDEX idx_remote_workspace_prs_workspace_repo_id ON remote_workspace_prs(workspace_repo_id);