-- Convert task_templates to tags
-- Migrate ALL templates (global + project-scoped)
-- No UNIQUE constraint on tag_name - users can create duplicates if they want
-- Global templates: keep original names
-- Project templates: prefixed with project name

CREATE TABLE tags (
    id            BLOB PRIMARY KEY,
    tag_name      TEXT NOT NULL,  -- No UNIQUE constraint
    content       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Insert global templates (keep original names as-is)
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    id,
    template_name,  -- Keep original casing and spaces
    description,
    created_at,
    updated_at
FROM task_templates
WHERE project_id IS NULL;

-- Insert ALL project templates with project prefix
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    t.id,
    p.name || '_' || t.template_name as tag_name,
    t.description,
    t.created_at,
    t.updated_at
FROM task_templates t
JOIN projects p ON t.project_id = p.id;

-- Drop old table and indexes
DROP INDEX idx_task_templates_project_id;
DROP INDEX idx_task_templates_unique_name_project;
DROP INDEX idx_task_templates_unique_name_global;
DROP TABLE task_templates;
