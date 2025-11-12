PRAGMA foreign_keys = ON;

ALTER TABLE projects
    ADD COLUMN remote_project_id BLOB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_remote_project_id
    ON projects(remote_project_id)
    WHERE remote_project_id IS NOT NULL;
