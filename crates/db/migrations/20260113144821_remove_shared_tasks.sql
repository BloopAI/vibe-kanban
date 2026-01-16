-- Remove shared task functionality

-- Drop index first
DROP INDEX IF EXISTS idx_tasks_shared_task_unique;

-- Remove shared_task_id column from tasks table
ALTER TABLE tasks DROP COLUMN shared_task_id;

-- Drop the shared_tasks related tables
DROP TABLE IF EXISTS shared_activity_cursors;
DROP TABLE IF EXISTS shared_tasks;
