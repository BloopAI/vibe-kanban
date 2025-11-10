ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name TEXT;

-- No longer need to compute personal org names based on string concat since we use UUID v5 now
-- All organizations should either have a name or use their slug
UPDATE organizations
SET name = slug
WHERE (name IS NULL OR name = '');

ALTER TABLE organizations ALTER COLUMN name SET NOT NULL;
