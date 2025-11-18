-- 1. ENUMS
-- We define enums for fields with a fixed set of options
CREATE TYPE project_visibility AS ENUM ('whole_team', 'members_only');
CREATE TYPE task_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'completed');

-- 3. PROJECTS
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#000000', -- Hex code
    visibility project_visibility NOT NULL DEFAULT 'whole_team',
    
    -- Sprint Settings
    sprints_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sprint_duration_weeks INTEGER DEFAULT 2,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PROJECT MEMBERS
CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (project_id, user_id)
);

-- 5. PROJECT STATUSES
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

-- 6. PROJECT NOTIFICATION PREFERENCES
CREATE TABLE project_task_notification_preferences (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    notify_on_status_updated BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_completed BOOLEAN NOT NULL DEFAULT TRUE,
    
    PRIMARY KEY (project_id, user_id)
);

-- 7. SPRINTS
CREATE TABLE sprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    label VARCHAR(100) NOT NULL, -- e.g. "Sprint 1"
    sequence_number INTEGER NOT NULL, -- e.g. 1
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status sprint_status NOT NULL DEFAULT 'planned',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. TASKS
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Status inherits from project_statuses
    status_id UUID NOT NULL REFERENCES project_statuses(id),
    
    -- Sprint is nullable (Backlog tasks have no sprint)
    sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
    
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
    lead BOOLEAN NOT NULL DEFAULT FALSE,
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

-- Indexes for common lookups
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_sprint_id ON tasks(sprint_id);
CREATE INDEX idx_tasks_status_id ON tasks(status_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);