-- Migration: Soft-delete execution data
-- Purpose: Mark existing execution data as archived without breaking functionality
-- This is a non-breaking change that preserves historical data

-- Add archived flag to execution_processes
ALTER TABLE execution_processes ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Add archived flag to sessions
ALTER TABLE sessions ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Add note column to workspaces to explain they're historical
ALTER TABLE workspaces ADD COLUMN execution_disabled_note TEXT;

-- Mark all existing execution processes as archived
UPDATE execution_processes SET archived = TRUE;

-- Mark all existing sessions as archived
UPDATE sessions SET archived = TRUE;

-- Add note to all existing workspaces
UPDATE workspaces
SET execution_disabled_note = 'Code execution features disabled. This workspace is preserved as a historical record.'
WHERE execution_disabled_note IS NULL;
