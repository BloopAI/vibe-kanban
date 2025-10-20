-- Convert task_templates to tags
-- Migrate ALL templates (global + project-scoped)
-- No UNIQUE constraint on tag_name - users can create duplicates if they want
-- Convert all names to snake_case (lowercase with underscores)

CREATE TABLE tags (
    id            BLOB PRIMARY KEY,
    tag_name      TEXT NOT NULL,  -- No UNIQUE constraint
    content       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Insert ALL templates (global + project) with snake_case conversion
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    id,
    LOWER(REPLACE(template_name, ' ', '_')) as tag_name,
    description,
    created_at,
    updated_at
FROM task_templates;

-- Drop old table and indexes
DROP INDEX idx_task_templates_project_id;
DROP INDEX idx_task_templates_unique_name_project;
DROP INDEX idx_task_templates_unique_name_global;
DROP TABLE task_templates;
