-- Forge Extension: add branch_template column to upstream tasks table if missing
-- This mirrors PR-22 schema drift without modifying upstream migrations.

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS branch_template TEXT;
