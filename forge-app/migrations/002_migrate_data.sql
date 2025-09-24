-- Data Migration for Forge Extensions
-- Task 2: Migrate existing branch_template data to auxiliary tables
--
-- This migration:
-- 1. Copies existing branch_template data from tasks table to forge_task_extensions
-- 2. Creates bidirectional sync triggers to maintain compatibility during transition
-- 3. Preserves the original branch_template column for rollback safety
--
-- ROLLBACK PLAN:
-- To rollback this migration:
-- 1. DROP TRIGGER sync_branch_template_to_extensions;
-- 2. DROP TRIGGER sync_branch_template_from_extensions;
-- 3. The original tasks.branch_template column will be preserved with original data

-- Migrate existing branch_template data to auxiliary table
-- Use INSERT OR IGNORE to handle case where data already exists
INSERT OR IGNORE INTO forge_task_extensions (task_id, branch_template)
SELECT id, branch_template
FROM tasks
WHERE branch_template IS NOT NULL;

-- Create bidirectional synchronization triggers to maintain compatibility
-- during the transition period. These ensure both tables stay in sync.

-- Sync from tasks table to forge_task_extensions when tasks.branch_template is updated
CREATE TRIGGER IF NOT EXISTS sync_branch_template_to_extensions
AFTER UPDATE OF branch_template ON tasks
WHEN NEW.branch_template != OLD.branch_template OR (NEW.branch_template IS NULL) != (OLD.branch_template IS NULL)
BEGIN
    INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template)
    VALUES (NEW.id, NEW.branch_template);
END;

-- Sync from forge_task_extensions to tasks table when auxiliary table is updated
CREATE TRIGGER IF NOT EXISTS sync_branch_template_from_extensions
AFTER UPDATE OF branch_template ON forge_task_extensions
WHEN NEW.branch_template != OLD.branch_template OR (NEW.branch_template IS NULL) != (OLD.branch_template IS NULL)
BEGIN
    UPDATE tasks SET branch_template = NEW.branch_template WHERE id = NEW.task_id;
END;

-- Handle inserts to forge_task_extensions
CREATE TRIGGER IF NOT EXISTS sync_branch_template_insert_to_tasks
AFTER INSERT ON forge_task_extensions
WHEN NEW.branch_template IS NOT NULL
BEGIN
    UPDATE tasks SET branch_template = NEW.branch_template WHERE id = NEW.task_id;
END;

-- Handle inserts to tasks with branch_template
CREATE TRIGGER IF NOT EXISTS sync_branch_template_insert_to_extensions
AFTER INSERT ON tasks
WHEN NEW.branch_template IS NOT NULL
BEGIN
    INSERT OR REPLACE INTO forge_task_extensions (task_id, branch_template)
    VALUES (NEW.id, NEW.branch_template);
END;

-- Log migration completion
INSERT OR IGNORE INTO forge_omni_notifications (
    id,
    task_id,
    notification_type,
    recipient,
    message,
    status,
    created_at
) VALUES (
    'migration-002-' || datetime('now'),
    NULL,
    'system',
    'migration',
    'Branch template data migration completed successfully',
    'sent',
    datetime('now')
);