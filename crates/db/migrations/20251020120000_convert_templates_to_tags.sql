-- Convert task_templates to tags
-- Migrate ALL templates (global + project-scoped) with collision handling
-- Global templates: clean names
-- Project templates: always prefixed with project name
-- Collisions: append _{uuid_prefix}

CREATE TABLE tags (
    id            BLOB PRIMARY KEY,
    tag_name      TEXT NOT NULL UNIQUE,
    content       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Step 1: Insert global templates with clean names
INSERT OR IGNORE INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    id,
    LOWER(REPLACE(template_name, ' ', '_')) as tag_name,
    description,
    created_at,
    updated_at
FROM task_templates
WHERE project_id IS NULL;

-- Step 2: Handle global collisions with UUID suffix
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    id,
    LOWER(REPLACE(template_name, ' ', '_')) || '_' || SUBSTR(HEX(id), 1, 8) as tag_name,
    description,
    created_at,
    updated_at
FROM task_templates
WHERE project_id IS NULL
  AND id NOT IN (SELECT id FROM tags);

-- Step 3: Insert ALL project templates with project prefix
INSERT OR IGNORE INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    t.id,
    LOWER(REPLACE(p.name || '_' || t.template_name, ' ', '_')) as tag_name,
    t.description,
    t.created_at,
    t.updated_at
FROM task_templates t
JOIN projects p ON t.project_id = p.id;

-- Step 4: Handle project template collisions with UUID suffix
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    t.id,
    LOWER(REPLACE(p.name || '_' || t.template_name, ' ', '_')) || '_' || SUBSTR(HEX(t.id), 1, 8) as tag_name,
    t.description,
    t.created_at,
    t.updated_at
FROM task_templates t
JOIN projects p ON t.project_id = p.id
WHERE t.id NOT IN (SELECT id FROM tags);

-- Drop old table and indexes
DROP INDEX idx_task_templates_project_id;
DROP INDEX idx_task_templates_unique_name_project;
DROP INDEX idx_task_templates_unique_name_global;
DROP TABLE task_templates;
