-- Add uat_branch column to project_repos so each project can pin a UAT branch per repo.
-- The UAT branch is used as the default target_branch when a workspace is created
-- from a project.
ALTER TABLE project_repos ADD COLUMN uat_branch TEXT;
