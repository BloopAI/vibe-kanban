PRAGMA foreign_keys = ON;

-- Kanban projects (local, no organization_id required)
CREATE TABLE kanban_projects (
    id           BLOB PRIMARY KEY,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#6366f1',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Kanban project statuses (columns on the board)
CREATE TABLE kanban_project_statuses (
    id           BLOB PRIMARY KEY,
    project_id   BLOB NOT NULL REFERENCES kanban_projects(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#94a3b8',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    hidden       INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX kanban_project_statuses_project_id ON kanban_project_statuses(project_id);

-- Kanban issues
CREATE TABLE kanban_issues (
    id                        BLOB PRIMARY KEY,
    project_id                BLOB NOT NULL REFERENCES kanban_projects(id) ON DELETE CASCADE,
    issue_number              INTEGER NOT NULL,
    simple_id                 TEXT NOT NULL,
    status_id                 BLOB NOT NULL REFERENCES kanban_project_statuses(id),
    title                     TEXT NOT NULL,
    description               TEXT,
    priority                  TEXT CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    start_date                TEXT,
    target_date               TEXT,
    completed_at              TEXT,
    sort_order                INTEGER NOT NULL DEFAULT 0,
    parent_issue_id           BLOB REFERENCES kanban_issues(id) ON DELETE SET NULL,
    parent_issue_sort_order   INTEGER,
    extension_metadata        TEXT NOT NULL DEFAULT '{}',
    creator_user_id           TEXT,
    created_at                TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at                TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (project_id, issue_number)
);

CREATE INDEX kanban_issues_project_id ON kanban_issues(project_id);
CREATE INDEX kanban_issues_status_id ON kanban_issues(status_id);
CREATE INDEX kanban_issues_parent_issue_id ON kanban_issues(parent_issue_id);

-- Kanban tags (per-project labels)
CREATE TABLE kanban_tags (
    id           BLOB PRIMARY KEY,
    project_id   BLOB NOT NULL REFERENCES kanban_projects(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#94a3b8',
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX kanban_tags_project_id ON kanban_tags(project_id);

-- Issue-to-tag many-to-many
CREATE TABLE kanban_issue_tags (
    id           BLOB PRIMARY KEY,
    issue_id     BLOB NOT NULL REFERENCES kanban_issues(id) ON DELETE CASCADE,
    tag_id       BLOB NOT NULL REFERENCES kanban_tags(id) ON DELETE CASCADE,
    UNIQUE (issue_id, tag_id)
);

CREATE INDEX kanban_issue_tags_issue_id ON kanban_issue_tags(issue_id);
CREATE INDEX kanban_issue_tags_tag_id ON kanban_issue_tags(tag_id);

-- Issue assignees (user_id is a string — local user placeholder)
CREATE TABLE kanban_issue_assignees (
    id           BLOB PRIMARY KEY,
    issue_id     BLOB NOT NULL REFERENCES kanban_issues(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    assigned_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (issue_id, user_id)
);

CREATE INDEX kanban_issue_assignees_issue_id ON kanban_issue_assignees(issue_id);

-- Issue relationships (blocking / related / has_duplicate)
CREATE TABLE kanban_issue_relationships (
    id                  BLOB PRIMARY KEY,
    issue_id            BLOB NOT NULL REFERENCES kanban_issues(id) ON DELETE CASCADE,
    related_issue_id    BLOB NOT NULL REFERENCES kanban_issues(id) ON DELETE CASCADE,
    relationship_type   TEXT NOT NULL CHECK (relationship_type IN ('blocking', 'related', 'has_duplicate')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (issue_id, related_issue_id, relationship_type)
);

CREATE INDEX kanban_issue_relationships_issue_id ON kanban_issue_relationships(issue_id);
