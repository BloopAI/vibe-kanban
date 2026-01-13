-- Add creator_user_id to projects table
-- This column tracks which user created the project

ALTER TABLE projects ADD COLUMN creator_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;

-- Create index for efficient lookups by creator
CREATE INDEX idx_projects_creator_user_id ON projects(creator_user_id);
