-- Migration to drop task_attempt_activities table
-- This removes the task attempt activity tracking functionality

-- Drop indexes first
DROP INDEX IF EXISTS idx_task_attempt_activities_execution_process_id;
DROP INDEX IF EXISTS idx_task_attempt_activities_created_at;

-- Drop the table
DROP TABLE IF EXISTS task_attempt_activities;
