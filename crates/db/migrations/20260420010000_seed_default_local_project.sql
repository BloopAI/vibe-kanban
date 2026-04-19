-- Seed a default project + kanban statuses for the local-only desktop app.
--
-- Without this, a fresh install lands on `/workspaces/create` because
-- `RootRedirectPage` calls `getFirstProjectDestination()` and gets `null`
-- (no project exists yet), so users never see the kanban board on first
-- launch. Seeding a default project + the canonical Todo / In Progress /
-- Done status columns gives the UI something to render and matches what
-- the cloud onboarding flow creates for new orgs.
--
-- Idempotency: deterministic UUIDs + `INSERT OR IGNORE` so this migration
-- never duplicates rows on subsequent runs and never overwrites a project
-- the user has since renamed.

-- Default project, owned by the seeded `Local` organization
-- (`00000000-...-00000002` from `20260420000000_local_remote_core.sql`).
INSERT OR IGNORE INTO remote_projects (id, organization_id, name, color, sort_order)
VALUES (
    X'00000000000000000000000000000003',
    X'00000000000000000000000000000002',
    'My Project',
    '217 91% 60%',
    0
);

-- Canonical 3-column kanban: Todo → In Progress → Done.
INSERT OR IGNORE INTO remote_project_statuses (id, project_id, name, color, sort_order, hidden)
VALUES
    (X'00000000000000000000000000000004', X'00000000000000000000000000000003', 'Todo',        '215 16% 47%', 0, 0),
    (X'00000000000000000000000000000005', X'00000000000000000000000000000003', 'In Progress', '38 92% 50%',  1, 0),
    (X'00000000000000000000000000000006', X'00000000000000000000000000000003', 'Done',        '142 71% 45%', 2, 0);
