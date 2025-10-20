-- Convert task_templates to tags
-- Remove title field, remove project scoping (all tags are global)
-- Rename template_name to tag_name, rename description to content

-- Create new tags table (no project_id - all tags are global)
CREATE TABLE tags (
    id            BLOB PRIMARY KEY,
    tag_name      TEXT NOT NULL UNIQUE,  -- Used as @tag_name, globally unique
    content       TEXT,                    -- The text that gets inserted
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Migrate data from old table
-- Only migrate global templates (project_id IS NULL) to avoid duplicate tag names
-- Auto-convert template names to valid tag names: lowercase, spaces to underscores
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    id,
    LOWER(REPLACE(template_name, ' ', '_')) as tag_name,
    description,
    created_at,
    updated_at
FROM task_templates
WHERE project_id IS NULL;

-- Drop old table and indexes
DROP INDEX idx_task_templates_project_id;
DROP INDEX idx_task_templates_unique_name_project;
DROP INDEX idx_task_templates_unique_name_global;
DROP TABLE task_templates;
