PRAGMA foreign_keys = ON;

-- Clear existing execution_processes records since we can't meaningfully migrate them
-- (old records lack the actual script content and prompts needed for ExecutorActions)
DELETE FROM execution_processes;

-- Add executor_action column to execution_processes table for storing full ExecutorActions JSON
ALTER TABLE execution_processes ADD COLUMN executor_action TEXT NOT NULL DEFAULT '';
