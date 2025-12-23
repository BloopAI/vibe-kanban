-- Add prefer_remote_branch column to projects table
ALTER TABLE projects ADD COLUMN prefer_remote_branch BOOLEAN NOT NULL DEFAULT 0;