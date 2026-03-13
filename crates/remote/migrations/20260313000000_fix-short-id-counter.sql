-- Fix short IDs to be unique per org, not per project.
-- Moves issue_counter from projects -> organizations so that issues
-- across all projects in an org share a single incrementing counter.
-- e.g., Project A issue 1 gets ORG-1, Project B issue 1 gets ORG-2.

-- 1. Add org-level counter
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS issue_counter INTEGER NOT NULL DEFAULT 0;

-- 2. Bootstrap org counters from the max issue_number already assigned
--    across all projects in each org, preventing collision with existing issues.
UPDATE organizations o
SET issue_counter = COALESCE(
    (
        SELECT MAX(i.issue_number)
        FROM issues i
        JOIN projects p ON p.id = i.project_id
        WHERE p.organization_id = o.id
    ),
    0
);

-- 3. Add denormalized organization_id to issues (required for the org-scoped unique constraint)
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 4. Backfill organization_id for all existing issues
UPDATE issues i
SET organization_id = p.organization_id
FROM projects p
WHERE i.project_id = p.id;

-- 5. Make it NOT NULL now that the column is fully populated
ALTER TABLE issues
    ALTER COLUMN organization_id SET NOT NULL;

-- 6. Drop the old per-project uniqueness constraint
ALTER TABLE issues
    DROP CONSTRAINT IF EXISTS issues_project_issue_number_uniq;

-- 7. Add new org-scoped uniqueness constraint
ALTER TABLE issues
    ADD CONSTRAINT issues_org_issue_number_uniq UNIQUE (organization_id, issue_number);

-- 8. Index to support org-scoped issue queries efficiently
CREATE INDEX IF NOT EXISTS idx_issues_organization_id ON issues(organization_id);

-- 9. Update the trigger function to increment the org counter instead of project counter.
--    The trigger trg_issues_simple_id itself does not need to be recreated.
CREATE OR REPLACE FUNCTION set_issue_simple_id()
RETURNS TRIGGER AS $$
DECLARE
    v_issue_number    INTEGER;
    v_issue_prefix    VARCHAR(10);
    v_organization_id UUID;
BEGIN
    -- Resolve organization and its prefix from the project
    SELECT p.organization_id, o.issue_prefix
    INTO v_organization_id, v_issue_prefix
    FROM projects p
    JOIN organizations o ON o.id = p.organization_id
    WHERE p.id = NEW.project_id;

    -- Atomically increment the organization's counter and capture the new value
    UPDATE organizations
    SET issue_counter = issue_counter + 1
    WHERE id = v_organization_id
    RETURNING issue_counter INTO v_issue_number;

    -- Assign all auto-generated fields
    NEW.issue_number    := v_issue_number;
    NEW.simple_id       := v_issue_prefix || '-' || v_issue_number;
    NEW.organization_id := v_organization_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Remove the now-unused per-project issue counter
ALTER TABLE projects
    DROP COLUMN IF EXISTS issue_counter;
