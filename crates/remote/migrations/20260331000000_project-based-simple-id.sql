-- Move simple ID prefix and counter from organizations to projects.
-- Each project gets its own prefix (derived from project name) and counter,
-- so issues are numbered per-project instead of per-org.

-- 1. Add prefix and counter columns to projects
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS issue_prefix VARCHAR(10) NOT NULL DEFAULT 'ISS',
    ADD COLUMN IF NOT EXISTS issue_counter INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill project prefixes from their organization's current prefix
UPDATE projects p
SET issue_prefix = o.issue_prefix
FROM organizations o
WHERE o.id = p.organization_id;

-- 3. Renumber issues per-project (ordered by created_at, id as tiebreaker)
--    and update simple_id to use the project's prefix.
WITH renumbered AS (
    SELECT
        i.id,
        ROW_NUMBER() OVER (
            PARTITION BY i.project_id
            ORDER BY i.created_at, i.id
        ) AS new_issue_number,
        p.issue_prefix
    FROM issues i
    JOIN projects p ON p.id = i.project_id
)
UPDATE issues i
SET
    issue_number = r.new_issue_number,
    simple_id    = r.issue_prefix || '-' || r.new_issue_number
FROM renumbered r
WHERE i.id = r.id;

-- 4. Backfill project counters to the max issue_number per project
UPDATE projects p
SET issue_counter = COALESCE(
    (SELECT MAX(i.issue_number) FROM issues i WHERE i.project_id = p.id),
    0
);

-- 5. Update denormalized notification payloads that store issue_simple_id
UPDATE notifications n
SET payload = jsonb_set(n.payload, '{issue_simple_id}', to_jsonb(i.simple_id), true)
FROM issues i
WHERE n.issue_id = i.id
  AND n.payload ? 'issue_simple_id';

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

-- 7. Drop the now-unused org-level counter
ALTER TABLE organizations
    DROP COLUMN IF EXISTS issue_counter;
