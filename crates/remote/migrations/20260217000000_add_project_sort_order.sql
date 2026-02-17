ALTER TABLE projects
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_organization_sort_order
ON projects (organization_id, sort_order);
