DROP TABLE IF EXISTS shared_activity_cursors;

-- Drop the index on the old column if it exists
DROP INDEX IF EXISTS idx_tasks_shared_task_unique;

-- Add new column to hold the data
ALTER TABLE tasks ADD COLUMN shared_task_id_new BLOB;

-- Migrate data
UPDATE tasks SET shared_task_id_new = shared_task_id;

-- Drop the old column (removing the foreign key constraint)
ALTER TABLE tasks DROP COLUMN shared_task_id;

-- Rename the new column to the old name
ALTER TABLE tasks RENAME COLUMN shared_task_id_new TO shared_task_id;

-- Recreate the index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_shared_task_unique
    ON tasks(shared_task_id)
    WHERE shared_task_id IS NOT NULL;

DROP TABLE IF EXISTS shared_tasks;