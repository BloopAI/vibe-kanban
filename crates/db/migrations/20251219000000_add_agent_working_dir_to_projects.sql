-- Add column with empty default first (named default_ because it's the default for new workspaces)
ALTER TABLE projects ADD COLUMN default_agent_working_dir TEXT DEFAULT '';

-- Copy existing dev_script_working_dir values to default_agent_working_dir
-- ONLY for single-repo projects (multi-repo projects should default to None/empty)
UPDATE projects SET default_agent_working_dir = dev_script_working_dir
WHERE dev_script_working_dir IS NOT NULL
  AND dev_script_working_dir != ''
  AND (SELECT COUNT(*) FROM project_repos WHERE project_repos.project_id = projects.id) = 1;

-- Add agent_working_dir to workspaces (snapshot of project's default at workspace creation)
ALTER TABLE workspaces ADD COLUMN agent_working_dir TEXT DEFAULT '';
