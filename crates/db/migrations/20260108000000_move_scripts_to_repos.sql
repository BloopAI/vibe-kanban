-- Add script columns to repos
ALTER TABLE repos ADD COLUMN setup_script TEXT;
ALTER TABLE repos ADD COLUMN cleanup_script TEXT;
ALTER TABLE repos ADD COLUMN copy_files TEXT;
ALTER TABLE repos ADD COLUMN parallel_setup_script INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN dev_server_script TEXT;

-- Migrate from first project_repo (by rowid) for each repo
UPDATE repos
SET
    setup_script = (SELECT pr.setup_script FROM project_repos pr WHERE pr.repo_id = repos.id ORDER BY pr.rowid ASC LIMIT 1),
    cleanup_script = (SELECT pr.cleanup_script FROM project_repos pr WHERE pr.repo_id = repos.id ORDER BY pr.rowid ASC LIMIT 1),
    copy_files = (SELECT pr.copy_files FROM project_repos pr WHERE pr.repo_id = repos.id ORDER BY pr.rowid ASC LIMIT 1),
    parallel_setup_script = COALESCE((SELECT pr.parallel_setup_script FROM project_repos pr WHERE pr.repo_id = repos.id ORDER BY pr.rowid ASC LIMIT 1), 0),
    dev_server_script = (SELECT pr.dev_server_script FROM project_repos pr WHERE pr.repo_id = repos.id ORDER BY pr.rowid ASC LIMIT 1);

-- Remove script columns from project_repos
ALTER TABLE project_repos DROP COLUMN setup_script;
ALTER TABLE project_repos DROP COLUMN cleanup_script;
ALTER TABLE project_repos DROP COLUMN copy_files;
ALTER TABLE project_repos DROP COLUMN parallel_setup_script;
ALTER TABLE project_repos DROP COLUMN dev_server_script;
