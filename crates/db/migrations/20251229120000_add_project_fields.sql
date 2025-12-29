-- Add Linear-style fields to projects table
-- Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
ALTER TABLE projects ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN lead_id BLOB;
ALTER TABLE projects ADD COLUMN start_date TEXT;
ALTER TABLE projects ADD COLUMN target_date TEXT;
ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'backlog';
ALTER TABLE projects ADD COLUMN health INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN summary TEXT;
ALTER TABLE projects ADD COLUMN icon TEXT;

-- Create indexes for common queries
CREATE INDEX idx_projects_priority ON projects(priority);
CREATE INDEX idx_projects_lead_id ON projects(lead_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_target_date ON projects(target_date);

-- Create milestones table for project milestones
CREATE TABLE IF NOT EXISTS milestones (
    id BLOB PRIMARY KEY NOT NULL,
    project_id BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    target_date TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_milestones_project_id ON milestones(project_id);

-- Create project_dependencies table for blocking relationships
CREATE TABLE IF NOT EXISTS project_dependencies (
    id BLOB PRIMARY KEY NOT NULL,
    project_id BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    depends_on_project_id BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL CHECK(dependency_type IN ('blocked_by', 'blocking')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, depends_on_project_id, dependency_type)
);

CREATE INDEX idx_project_dependencies_project_id ON project_dependencies(project_id);
CREATE INDEX idx_project_dependencies_depends_on ON project_dependencies(depends_on_project_id);

-- Create project_labels table for project labels
CREATE TABLE IF NOT EXISTS project_labels (
    id BLOB PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for project-label relationships
CREATE TABLE IF NOT EXISTS project_label_assignments (
    project_id BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label_id BLOB NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, label_id)
);

CREATE INDEX idx_project_label_assignments_project ON project_label_assignments(project_id);
CREATE INDEX idx_project_label_assignments_label ON project_label_assignments(label_id);

-- Create project_members junction table for team members
CREATE TABLE IF NOT EXISTS project_members (
    project_id BLOB NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id BLOB NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
