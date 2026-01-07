-- Add migration script here

-- 1) Create replacement column (nullable TEXT)
ALTER TABLE task_attempts ADD COLUMN branch_new TEXT;  -- nullable

-- 2) Copy existing values
UPDATE task_attempts SET branch_new = branch;

-- If you have indexes/triggers/constraints that reference "branch",
-- drop them before the next two steps and recreate them afterwards.

-- 3) Remove the old non-nullable column
ALTER TABLE task_attempts DROP COLUMN branch;

-- 4) Keep the original column name
ALTER TABLE task_attempts RENAME COLUMN branch_new TO branch;
