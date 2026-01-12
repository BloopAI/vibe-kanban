-- Create project_groups table for persistent grouping
CREATE TABLE project_groups (
    id         BLOB PRIMARY KEY,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Index for ordering groups by position
CREATE INDEX idx_project_groups_position ON project_groups(position);

-- Add group_id foreign key to projects table
-- ON DELETE SET NULL ensures projects become ungrouped when their group is deleted
ALTER TABLE projects ADD COLUMN group_id BLOB REFERENCES project_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_projects_group_id ON projects(group_id);
