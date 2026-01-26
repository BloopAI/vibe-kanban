-- Add hold columns to tasks table
-- A hold prevents agents from starting workspace sessions and signals manual work in progress
ALTER TABLE tasks ADD COLUMN hold_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN hold_comment TEXT;
ALTER TABLE tasks ADD COLUMN hold_at TEXT;

-- Index for efficient lookup of tasks by hold user
CREATE INDEX idx_tasks_hold_user_id ON tasks(hold_user_id);
