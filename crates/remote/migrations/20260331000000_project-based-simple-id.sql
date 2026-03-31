-- Move simple ID prefix and counter from organizations to projects.
-- Each project gets its own prefix (derived from project name) and counter,
-- so issues are numbered per-project instead of per-org.

-- 1. Add prefix and counter columns to projects
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS issue_prefix VARCHAR(10) NOT NULL DEFAULT 'ISS',
    ADD COLUMN IF NOT EXISTS issue_counter INTEGER NOT NULL DEFAULT 0;

-- 2. Derive project prefixes from project names (first 3 alpha chars, uppercased)
--    Projects with no alpha chars keep the 'ISS' default from step 1
UPDATE projects
SET issue_prefix = UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 3))
WHERE REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g') <> '';

-- 3. Update existing issues to use the new project prefix
UPDATE issues i
SET simple_id = p.issue_prefix || '-' || i.issue_number
FROM projects p
WHERE p.id = i.project_id;

-- 5. Backfill project counters to the max issue_number per project
--    so the trigger doesn't restart numbering at 1
UPDATE projects p
SET issue_counter = COALESCE(
    (SELECT MAX(i.issue_number) FROM issues i WHERE i.project_id = p.id),
    0
);

-- 6. Replace the trigger function to use project prefix/counter directly
CREATE OR REPLACE FUNCTION set_issue_simple_id()
RETURNS TRIGGER AS $$
DECLARE
    v_issue_number INTEGER;
    v_issue_prefix VARCHAR(10);
BEGIN
    -- Atomically increment the project's counter and capture the new value
    UPDATE projects
    SET issue_counter = issue_counter + 1
    WHERE id = NEW.project_id
    RETURNING issue_counter, issue_prefix
    INTO v_issue_number, v_issue_prefix;

    -- Assign auto-generated fields
    NEW.issue_number := v_issue_number;
    NEW.simple_id    := v_issue_prefix || '-' || v_issue_number;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Drop the now-unused org-level issue columns
ALTER TABLE organizations
    DROP COLUMN IF EXISTS issue_counter,
    DROP COLUMN IF EXISTS issue_prefix;
