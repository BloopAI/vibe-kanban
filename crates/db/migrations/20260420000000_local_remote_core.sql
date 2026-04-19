-- Local-only mirror of crates/remote core schema (orgs/projects/issues/...).
-- All tables prefixed `remote_` to avoid conflicts with the existing local
-- `projects`, `tags`, `workspaces` tables. SQLite/sqlx convention: BLOB for
-- UUIDs, TEXT for ISO8601 timestamps, JSON stored as TEXT.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- USERS (single placeholder row representing the local desktop user)
-- ---------------------------------------------------------------------------
CREATE TABLE remote_users (
    id          BLOB PRIMARY KEY,
    email       TEXT,
    display_name TEXT,
    avatar_url  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- ---------------------------------------------------------------------------
-- ORGANIZATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE remote_organizations (
    id            BLOB PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    issue_prefix  TEXT NOT NULL DEFAULT 'ISS',
    avatar_url    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE TABLE remote_organization_members (
    organization_id BLOB NOT NULL REFERENCES remote_organizations(id) ON DELETE CASCADE,
    user_id         BLOB NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','admin','member')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    PRIMARY KEY (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------------
CREATE TABLE remote_projects (
    id              BLOB PRIMARY KEY,
    organization_id BLOB NOT NULL REFERENCES remote_organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '0 0% 0%',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    issue_counter   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_remote_projects_org ON remote_projects(organization_id);

-- ---------------------------------------------------------------------------
-- PROJECT STATUSES
-- ---------------------------------------------------------------------------
CREATE TABLE remote_project_statuses (
    id          BLOB PRIMARY KEY,
    project_id  BLOB NOT NULL REFERENCES remote_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    hidden      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_remote_project_statuses_project ON remote_project_statuses(project_id);

-- ---------------------------------------------------------------------------
-- TAGS
-- ---------------------------------------------------------------------------
CREATE TABLE remote_tags (
    id          BLOB PRIMARY KEY,
    project_id  BLOB NOT NULL REFERENCES remote_projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    UNIQUE (project_id, name)
);

-- ---------------------------------------------------------------------------
-- ISSUES
-- ---------------------------------------------------------------------------
CREATE TABLE remote_issues (
    id              BLOB PRIMARY KEY,
    project_id      BLOB NOT NULL REFERENCES remote_projects(id) ON DELETE CASCADE,
    issue_number    INTEGER NOT NULL,
    simple_id       TEXT NOT NULL,
    status_id       BLOB NOT NULL REFERENCES remote_project_statuses(id),
    title           TEXT NOT NULL,
    description     TEXT,
    priority        TEXT CHECK (priority IS NULL OR priority IN ('urgent','high','medium','low')),
    start_date      TEXT,
    target_date     TEXT,
    completed_at    TEXT,
    sort_order      REAL NOT NULL DEFAULT 0,
    parent_issue_id BLOB REFERENCES remote_issues(id) ON DELETE SET NULL,
    parent_issue_sort_order REAL,
    extension_metadata TEXT NOT NULL DEFAULT '{}',
    creator_user_id BLOB REFERENCES remote_users(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (project_id, issue_number)
);

CREATE INDEX idx_remote_issues_project ON remote_issues(project_id);
CREATE INDEX idx_remote_issues_status ON remote_issues(status_id);
CREATE INDEX idx_remote_issues_parent ON remote_issues(parent_issue_id);
CREATE INDEX idx_remote_issues_simple ON remote_issues(simple_id);

-- Trigger: assign issue_number + simple_id atomically on insert
-- (PG's set_issue_simple_id() function port, using BEFORE INSERT trigger).
CREATE TRIGGER trg_remote_issues_simple_id
BEFORE INSERT ON remote_issues
FOR EACH ROW
WHEN NEW.issue_number = 0 OR NEW.simple_id = ''
BEGIN
    UPDATE remote_projects
    SET issue_counter = issue_counter + 1
    WHERE id = NEW.project_id;

    SELECT RAISE(ABORT, 'parent project not found')
    WHERE NOT EXISTS (SELECT 1 FROM remote_projects WHERE id = NEW.project_id);
END;

-- The trigger above bumps the counter; we need a second AFTER INSERT trigger
-- to backfill the inserted row's issue_number + simple_id. Because SQLite
-- triggers cannot mutate NEW, we use rowid + UPDATE in AFTER trigger.
CREATE TRIGGER trg_remote_issues_simple_id_after
AFTER INSERT ON remote_issues
FOR EACH ROW
WHEN NEW.issue_number = 0 OR NEW.simple_id = ''
BEGIN
    UPDATE remote_issues
    SET issue_number = (SELECT issue_counter FROM remote_projects WHERE id = NEW.project_id),
        simple_id = (
            SELECT o.issue_prefix || '-' || p.issue_counter
            FROM remote_projects p
            JOIN remote_organizations o ON o.id = p.organization_id
            WHERE p.id = NEW.project_id
        )
    WHERE rowid = NEW.rowid;
END;

-- ---------------------------------------------------------------------------
-- ISSUE ASSIGNEES
-- ---------------------------------------------------------------------------
CREATE TABLE remote_issue_assignees (
    id          BLOB PRIMARY KEY,
    issue_id    BLOB NOT NULL REFERENCES remote_issues(id) ON DELETE CASCADE,
    user_id     BLOB NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (issue_id, user_id)
);

-- ---------------------------------------------------------------------------
-- ISSUE TAGS
-- ---------------------------------------------------------------------------
CREATE TABLE remote_issue_tags (
    id        BLOB PRIMARY KEY,
    issue_id  BLOB NOT NULL REFERENCES remote_issues(id) ON DELETE CASCADE,
    tag_id    BLOB NOT NULL REFERENCES remote_tags(id) ON DELETE CASCADE,
    UNIQUE (issue_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- ISSUE RELATIONSHIPS
-- ---------------------------------------------------------------------------
CREATE TABLE remote_issue_relationships (
    id                BLOB PRIMARY KEY,
    issue_id          BLOB NOT NULL REFERENCES remote_issues(id) ON DELETE CASCADE,
    related_issue_id  BLOB NOT NULL REFERENCES remote_issues(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('blocking','related','has_duplicate')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (issue_id, related_issue_id, relationship_type),
    CHECK (issue_id != related_issue_id)
);

-- ---------------------------------------------------------------------------
-- WORKSPACES (cloud workspace metadata; distinct from local `workspaces`
-- table in 20251216142123_refactor_task_attempts_to_workspaces_sessions.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE remote_workspaces (
    id                  BLOB PRIMARY KEY,
    project_id          BLOB NOT NULL REFERENCES remote_projects(id) ON DELETE CASCADE,
    owner_user_id       BLOB NOT NULL REFERENCES remote_users(id) ON DELETE CASCADE,
    issue_id            BLOB REFERENCES remote_issues(id) ON DELETE SET NULL,
    local_workspace_id  BLOB UNIQUE,
    name                TEXT,
    archived            INTEGER NOT NULL DEFAULT 0,
    files_changed       INTEGER,
    lines_added         INTEGER,
    lines_removed       INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_remote_workspaces_project ON remote_workspaces(project_id);
CREATE INDEX idx_remote_workspaces_owner ON remote_workspaces(owner_user_id);
CREATE INDEX idx_remote_workspaces_issue ON remote_workspaces(issue_id);
CREATE INDEX idx_remote_workspaces_local ON remote_workspaces(local_workspace_id);

-- ---------------------------------------------------------------------------
-- ATTACHMENTS / BLOBS / PENDING UPLOADS (local file-system backed)
-- ---------------------------------------------------------------------------
CREATE TABLE remote_blobs (
    id              BLOB PRIMARY KEY,
    path            TEXT NOT NULL,
    thumbnail_path  TEXT,
    original_name   TEXT NOT NULL,
    mime_type       TEXT,
    size_bytes      INTEGER NOT NULL,
    hash            TEXT NOT NULL UNIQUE,
    width           INTEGER,
    height          INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE TABLE remote_attachments (
    id          BLOB PRIMARY KEY,
    blob_id     BLOB NOT NULL REFERENCES remote_blobs(id) ON DELETE CASCADE,
    issue_id    BLOB REFERENCES remote_issues(id) ON DELETE CASCADE,
    comment_id  BLOB,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    expires_at  TEXT
);

CREATE INDEX idx_remote_attachments_issue ON remote_attachments(issue_id);
CREATE INDEX idx_remote_attachments_blob ON remote_attachments(blob_id);

CREATE TABLE remote_pending_uploads (
    id              BLOB PRIMARY KEY,
    project_id      BLOB NOT NULL REFERENCES remote_projects(id) ON DELETE CASCADE,
    expected_hash   TEXT NOT NULL,
    expected_size   INTEGER NOT NULL,
    original_name   TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- ---------------------------------------------------------------------------
-- SEED a local user + default org so the UI has something to bind to
-- ---------------------------------------------------------------------------
-- (UUIDs are deterministic so subsequent restarts don't duplicate.)
INSERT OR IGNORE INTO remote_users (id, email, display_name)
VALUES (X'00000000000000000000000000000001', 'local@vibe-kanban.local', 'Local User');

INSERT OR IGNORE INTO remote_organizations (id, name, slug, issue_prefix)
VALUES (X'00000000000000000000000000000002', 'Local', 'local', 'VK');

INSERT OR IGNORE INTO remote_organization_members (organization_id, user_id, role)
VALUES (X'00000000000000000000000000000002', X'00000000000000000000000000000001', 'owner');
