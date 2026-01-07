-- Add PR tracking fields to task_attempts table
ALTER TABLE task_attempts ADD COLUMN pr_url TEXT;
ALTER TABLE task_attempts ADD COLUMN pr_number INTEGER;
ALTER TABLE task_attempts ADD COLUMN pr_status TEXT; -- open, closed, merged
ALTER TABLE task_attempts ADD COLUMN pr_merged_at DATETIME;
