-- add git_commit_title_mode to projects for per-project override
-- NULL = usa config global, valor = override por proyecto
ALTER TABLE projects ADD COLUMN git_commit_title_mode TEXT DEFAULT NULL;
