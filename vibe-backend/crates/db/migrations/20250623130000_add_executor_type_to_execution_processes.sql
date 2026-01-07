PRAGMA foreign_keys = ON;

-- Add executor_type column to execution_processes table
ALTER TABLE execution_processes ADD COLUMN executor_type TEXT;
