-- Migration to relate task_attempt_activities to execution_processes instead of task_attempts
-- This migration will:
-- 1. Drop and recreate the task_attempt_activities table with execution_process_id
-- 2. Clear existing data as it cannot be migrated meaningfully

-- Drop the existing table (this will wipe existing activity data)
DROP TABLE IF EXISTS task_attempt_activities;

-- Create the new table structure with execution_process_id foreign key
CREATE TABLE task_attempt_activities (
    id TEXT PRIMARY KEY,
    execution_process_id TEXT NOT NULL REFERENCES execution_processes(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

-- Create index for efficient lookups by execution_process_id
CREATE INDEX idx_task_attempt_activities_execution_process_id ON task_attempt_activities(execution_process_id);

-- Create index for efficient lookups by created_at for ordering
CREATE INDEX idx_task_attempt_activities_created_at ON task_attempt_activities(created_at);
