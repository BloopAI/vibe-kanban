-- Phase 3: Task Attribution & Assignment
-- Add creator_user_id to track who created the task
-- Add assignee_user_id to track who is assigned to work on the task

ALTER TABLE tasks ADD COLUMN creator_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN assignee_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_creator_user_id ON tasks(creator_user_id);
CREATE INDEX idx_tasks_assignee_user_id ON tasks(assignee_user_id);
