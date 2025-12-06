-- Migration: Drop legacy cache tables
-- Phase 1F.8: Remove Legacy Code
--
-- The unified schema (projects + tasks with is_remote flag) is now the
-- single source of truth. The cached_node_projects and node_sync_cursors
-- tables are no longer needed since:
-- 1. node_cache.rs now syncs directly to the unified projects table
-- 2. Remote project data is stored in projects where is_remote = true
-- 3. Task sync uses the unified tasks table

-- Drop the legacy cached node projects table
DROP TABLE IF EXISTS cached_node_projects;

-- Drop the node sync cursors table (no longer used)
DROP TABLE IF EXISTS node_sync_cursors;

-- Note: We keep cached_nodes table as it's still used for displaying
-- node status information in the unified projects view.
