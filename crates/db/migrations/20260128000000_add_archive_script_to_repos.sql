-- Add archive_script column to repos table
-- This script runs when a workspace is being archived
ALTER TABLE repos ADD COLUMN archive_script TEXT;
