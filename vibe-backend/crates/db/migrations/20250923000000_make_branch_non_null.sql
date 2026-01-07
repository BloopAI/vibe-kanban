-- Make branch column NOT NULL by recreating it
-- First update any NULL values to 'main'
-- Note: NULL values should not exist in practice, this is just a safety measure
UPDATE task_attempts SET branch = 'main' WHERE branch IS NULL;

-- 1) Create replacement column (NOT NULL TEXT)
ALTER TABLE task_attempts ADD COLUMN branch_new TEXT NOT NULL DEFAULT 'main';

-- 2) Copy existing values
UPDATE task_attempts SET branch_new = branch;

-- 3) Remove the old nullable column
ALTER TABLE task_attempts DROP COLUMN branch;

-- 4) Keep the original column name
ALTER TABLE task_attempts RENAME COLUMN branch_new TO branch;

-- Rename base_branch to target_branch now that we only need one column
ALTER TABLE task_attempts RENAME COLUMN base_branch TO target_branch;