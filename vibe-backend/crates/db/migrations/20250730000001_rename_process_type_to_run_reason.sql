PRAGMA foreign_keys = ON;

-- Rename process_type column to run_reason for better semantic clarity
ALTER TABLE execution_processes RENAME COLUMN process_type TO run_reason;
