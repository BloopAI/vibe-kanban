-- Add task templates tables
CREATE TABLE task_templates (
    id            BLOB PRIMARY KEY,
    project_id    BLOB,  -- NULL for global templates
    title         TEXT NOT NULL,
    description   TEXT,
    template_name TEXT NOT NULL,  -- Display name for the template
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Add index for faster queries
CREATE INDEX idx_task_templates_project_id ON task_templates(project_id);

-- Add unique constraint to prevent duplicate template names within same scope
CREATE UNIQUE INDEX idx_task_templates_unique_name 
ON task_templates(project_id, template_name);