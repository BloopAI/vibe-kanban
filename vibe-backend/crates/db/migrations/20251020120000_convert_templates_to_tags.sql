-- Convert task_templates to tags
-- Migrate ALL templates with snake_case conversion

CREATE TABLE tags (
    id            BLOB PRIMARY KEY,
    tag_name      TEXT NOT NULL CHECK(INSTR(tag_name, ' ') = 0),
    content       TEXT NOT NULL CHECK(content != ''),
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Only migrate templates that have non-empty descriptions
-- Templates with empty/null descriptions are skipped
INSERT INTO tags (id, tag_name, content, created_at, updated_at)
SELECT
    id,
    LOWER(REPLACE(template_name, ' ', '_')) as tag_name,
    description,
    created_at,
    updated_at
FROM task_templates
WHERE description IS NOT NULL AND description != '';

DROP INDEX idx_task_templates_project_id;
DROP INDEX idx_task_templates_unique_name_project;
DROP INDEX idx_task_templates_unique_name_global;
DROP TABLE task_templates;
