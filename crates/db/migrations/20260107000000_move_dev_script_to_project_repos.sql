-- Add dev_server_script column to project_repos
ALTER TABLE project_repos ADD COLUMN dev_server_script TEXT;

-- Migrate existing dev_script from projects to the first project_repo (by rowid/insertion order)
-- This ensures existing dev_script configurations are preserved
UPDATE project_repos
SET dev_server_script = (
    SELECT p.dev_script
    FROM projects p
    WHERE p.id = project_repos.project_id
      AND p.dev_script IS NOT NULL
      AND p.dev_script != ''
)
WHERE project_repos.id IN (
    SELECT pr.id
    FROM project_repos pr
    WHERE pr.rowid = (
        SELECT MIN(pr2.rowid)
        FROM project_repos pr2
        WHERE pr2.project_id = pr.project_id
    )
);

-- Remove dev_script and dev_script_working_dir columns from projects
-- (SQLite 3.35+ supports DROP COLUMN)
ALTER TABLE projects DROP COLUMN dev_script;
ALTER TABLE projects DROP COLUMN dev_script_working_dir;
