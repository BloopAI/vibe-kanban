-- Add working_directory to projects for non-git directory-only projects
ALTER TABLE projects ADD COLUMN working_directory TEXT;
