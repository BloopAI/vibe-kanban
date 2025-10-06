ALTER TABLE projects
    ADD COLUMN has_remote INTEGER NOT NULL DEFAULT 0;

ALTER TABLE projects
    ADD COLUMN github_repo_owner TEXT;

ALTER TABLE projects
    ADD COLUMN github_repo_name TEXT;

ALTER TABLE projects
    ADD COLUMN github_repo_id INTEGER;
