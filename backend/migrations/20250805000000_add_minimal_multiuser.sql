PRAGMA foreign_keys = ON;

-- Create minimal users table
CREATE TABLE users (
    id BLOB PRIMARY KEY,
    github_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    github_token TEXT,  -- For git attribution (can be NULL if not provided)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add user attribution to existing tables
ALTER TABLE tasks ADD COLUMN assigned_to BLOB REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN created_by BLOB REFERENCES users(id);
ALTER TABLE projects ADD COLUMN created_by BLOB REFERENCES users(id);
ALTER TABLE task_attempts ADD COLUMN created_by BLOB REFERENCES users(id);

-- Add indexes for better query performance
CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_task_attempts_created_by ON task_attempts(created_by);