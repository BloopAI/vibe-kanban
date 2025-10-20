-- Convert task_templates to task_tags
-- Remove title field, rename template_name to tag_name, rename description to content

-- Create new task_tags table
CREATE TABLE task_tags (
    id            BLOB PRIMARY KEY,
    project_id    BLOB,  -- NULL for global tags
    tag_name      TEXT NOT NULL,  -- Used as @tag_name
    content       TEXT,           -- The text that gets inserted
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Migrate data from old table (drop title field, rename columns)
INSERT INTO task_tags (id, project_id, tag_name, content, created_at, updated_at)
SELECT id, project_id, template_name, description, created_at, updated_at
FROM task_templates;

-- Create indexes
CREATE INDEX idx_task_tags_project_id ON task_tags(project_id);

-- Add unique constraints to prevent duplicate tag names within same scope
-- For project-specific tags: unique within each project
CREATE UNIQUE INDEX idx_task_tags_unique_name_project
ON task_tags(project_id, tag_name)
WHERE project_id IS NOT NULL;

-- For global tags: unique across all global tags
CREATE UNIQUE INDEX idx_task_tags_unique_name_global
ON task_tags(tag_name)
WHERE project_id IS NULL;

-- Drop old table and indexes
DROP INDEX idx_task_templates_project_id;
DROP INDEX idx_task_templates_unique_name_project;
DROP INDEX idx_task_templates_unique_name_global;
DROP TABLE task_templates;
