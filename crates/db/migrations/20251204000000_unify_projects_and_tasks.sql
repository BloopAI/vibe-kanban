-- Migration: Unify local and remote projects/tasks in same tables
-- Phase 1F: Full Schema Unification

-- ============================================
-- Step 1: Extend projects table for remote support
-- ============================================

-- Add remote/sync fields to projects
ALTER TABLE projects ADD COLUMN is_remote BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN source_node_id BLOB;           -- UUID of origin node
ALTER TABLE projects ADD COLUMN source_node_name TEXT;         -- Human-readable node name
ALTER TABLE projects ADD COLUMN source_node_public_url TEXT;   -- For direct streaming
ALTER TABLE projects ADD COLUMN source_node_status TEXT DEFAULT 'unknown';
ALTER TABLE projects ADD COLUMN remote_last_synced_at TEXT;

-- Index for filtering remote vs local projects
CREATE INDEX idx_projects_is_remote ON projects(is_remote);
CREATE INDEX idx_projects_source_node ON projects(source_node_id) WHERE source_node_id IS NOT NULL;

-- ============================================
-- Step 2: Extend tasks table for remote support
-- ============================================

-- Add remote execution tracking fields
ALTER TABLE tasks ADD COLUMN is_remote BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN remote_assignee_user_id BLOB;
ALTER TABLE tasks ADD COLUMN remote_assignee_name TEXT;        -- Cached display name
ALTER TABLE tasks ADD COLUMN remote_assignee_username TEXT;
ALTER TABLE tasks ADD COLUMN remote_version INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN remote_last_synced_at TEXT;

-- Direct stream location for future use
ALTER TABLE tasks ADD COLUMN remote_stream_node_id BLOB;
ALTER TABLE tasks ADD COLUMN remote_stream_url TEXT;

-- Index for remote task filtering
CREATE INDEX idx_tasks_is_remote ON tasks(is_remote);

-- ============================================
-- Step 3: Drop the cache table (data will be migrated to projects)
-- ============================================
-- Note: We'll migrate data from cached_node_projects to projects first,
-- then drop the cache table. For now, keep it for backwards compatibility
-- during the transition. The sync service will handle the migration.

-- DROP TABLE IF EXISTS cached_node_projects;
-- We'll drop this in a later migration after confirming the sync works
