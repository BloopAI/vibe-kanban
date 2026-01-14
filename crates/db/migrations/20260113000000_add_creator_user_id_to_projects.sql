ALTER TABLE projects ADD COLUMN creator_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_creator_user_id ON projects(creator_user_id);
