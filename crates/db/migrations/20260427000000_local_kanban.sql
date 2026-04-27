PRAGMA foreign_keys = ON;

CREATE TABLE local_project_metadata (
    project_id      BLOB PRIMARY KEY,
    organization_id BLOB NOT NULL,
    color           TEXT NOT NULL DEFAULT '210 80% 52%',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO local_project_metadata (project_id, organization_id, sort_order)
SELECT
    id,
    X'00000000000000000000000000000002',
    ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1
FROM projects;

CREATE TABLE local_project_statuses (
    id         BLOB PRIMARY KEY,
    project_id BLOB NOT NULL,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    hidden     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_local_project_statuses_project_id
    ON local_project_statuses(project_id);

INSERT INTO local_project_statuses (id, project_id, name, color, sort_order, hidden)
SELECT randomblob(16), id, 'Todo', '210 80% 52%', 100, 0 FROM projects
UNION ALL
SELECT randomblob(16), id, 'In Progress', '38 92% 50%', 200, 0 FROM projects
UNION ALL
SELECT randomblob(16), id, 'In Review', '265 70% 62%', 300, 0 FROM projects
UNION ALL
SELECT randomblob(16), id, 'Done', '145 63% 42%', 400, 0 FROM projects
UNION ALL
SELECT randomblob(16), id, 'Cancelled', '0 0% 50%', 500, 1 FROM projects;

CREATE TABLE local_issues (
    id                      BLOB PRIMARY KEY,
    project_id              BLOB NOT NULL,
    issue_number            INTEGER NOT NULL,
    simple_id               TEXT NOT NULL,
    status_id               BLOB NOT NULL,
    title                   TEXT NOT NULL,
    description             TEXT,
    priority                TEXT CHECK (priority IS NULL OR priority IN ('urgent','high','medium','low')),
    start_date              TEXT,
    target_date             TEXT,
    completed_at            TEXT,
    sort_order              REAL NOT NULL,
    parent_issue_id         BLOB,
    parent_issue_sort_order REAL,
    extension_metadata      TEXT NOT NULL DEFAULT 'null',
    creator_user_id         BLOB,
    created_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (status_id) REFERENCES local_project_statuses(id),
    FOREIGN KEY (parent_issue_id) REFERENCES local_issues(id) ON DELETE SET NULL,
    UNIQUE (project_id, issue_number),
    UNIQUE (project_id, simple_id)
);

CREATE INDEX idx_local_issues_project_id ON local_issues(project_id);
CREATE INDEX idx_local_issues_status_id ON local_issues(status_id);
CREATE INDEX idx_local_issues_parent_issue_id ON local_issues(parent_issue_id);

WITH numbered_tasks AS (
    SELECT
        t.*,
        ROW_NUMBER() OVER (
            PARTITION BY t.project_id
            ORDER BY t.created_at ASC, t.id ASC
        ) AS local_issue_number,
        ROW_NUMBER() OVER (
            PARTITION BY t.project_id, t.status
            ORDER BY t.created_at ASC, t.id ASC
        ) AS local_status_index
    FROM tasks t
)
INSERT INTO local_issues (
    id,
    project_id,
    issue_number,
    simple_id,
    status_id,
    title,
    description,
    sort_order,
    creator_user_id,
    created_at,
    updated_at
)
SELECT
    t.id,
    t.project_id,
    t.local_issue_number,
    'LOCAL-' || t.local_issue_number,
    s.id,
    t.title,
    t.description,
    s.sort_order * 10 + t.local_status_index,
    X'00000000000000000000000000000001',
    t.created_at,
    t.updated_at
FROM numbered_tasks t
JOIN local_project_statuses s
  ON s.project_id = t.project_id
 AND s.name = CASE t.status
    WHEN 'todo' THEN 'Todo'
    WHEN 'inprogress' THEN 'In Progress'
    WHEN 'inreview' THEN 'In Review'
    WHEN 'done' THEN 'Done'
    WHEN 'cancelled' THEN 'Cancelled'
    ELSE 'Todo'
 END;

CREATE TABLE local_tags (
    id         BLOB PRIMARY KEY,
    project_id BLOB NOT NULL,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_local_tags_project_id ON local_tags(project_id);

CREATE TABLE local_issue_tags (
    id       BLOB PRIMARY KEY,
    issue_id BLOB NOT NULL,
    tag_id   BLOB NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES local_issues(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES local_tags(id) ON DELETE CASCADE,
    UNIQUE (issue_id, tag_id)
);

CREATE INDEX idx_local_issue_tags_issue_id ON local_issue_tags(issue_id);
CREATE INDEX idx_local_issue_tags_tag_id ON local_issue_tags(tag_id);

CREATE TABLE local_issue_assignees (
    id          BLOB PRIMARY KEY,
    issue_id    BLOB NOT NULL,
    user_id     BLOB NOT NULL,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (issue_id) REFERENCES local_issues(id) ON DELETE CASCADE,
    UNIQUE (issue_id, user_id)
);

CREATE INDEX idx_local_issue_assignees_issue_id ON local_issue_assignees(issue_id);

CREATE TABLE local_issue_followers (
    id       BLOB PRIMARY KEY,
    issue_id BLOB NOT NULL,
    user_id  BLOB NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES local_issues(id) ON DELETE CASCADE,
    UNIQUE (issue_id, user_id)
);

CREATE INDEX idx_local_issue_followers_issue_id ON local_issue_followers(issue_id);

CREATE TABLE local_issue_relationships (
    id                  BLOB PRIMARY KEY,
    issue_id            BLOB NOT NULL,
    related_issue_id    BLOB NOT NULL,
    relationship_type   TEXT NOT NULL CHECK (relationship_type IN ('blocking','related','has_duplicate')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (issue_id) REFERENCES local_issues(id) ON DELETE CASCADE,
    FOREIGN KEY (related_issue_id) REFERENCES local_issues(id) ON DELETE CASCADE
);

CREATE INDEX idx_local_issue_relationships_issue_id ON local_issue_relationships(issue_id);
CREATE INDEX idx_local_issue_relationships_related_issue_id ON local_issue_relationships(related_issue_id);

CREATE TABLE local_issue_comments (
    id         BLOB PRIMARY KEY,
    issue_id   BLOB NOT NULL,
    author_id  BLOB,
    parent_id  BLOB,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (issue_id) REFERENCES local_issues(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES local_issue_comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_local_issue_comments_issue_id ON local_issue_comments(issue_id);

CREATE TABLE local_issue_comment_reactions (
    id         BLOB PRIMARY KEY,
    comment_id BLOB NOT NULL,
    user_id    BLOB NOT NULL,
    emoji      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (comment_id) REFERENCES local_issue_comments(id) ON DELETE CASCADE,
    UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX idx_local_issue_comment_reactions_comment_id
    ON local_issue_comment_reactions(comment_id);

CREATE TABLE local_workspace_links (
    workspace_id BLOB PRIMARY KEY,
    project_id   BLOB NOT NULL,
    issue_id     BLOB NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (issue_id) REFERENCES local_issues(id) ON DELETE CASCADE
);

CREATE INDEX idx_local_workspace_links_project_id
    ON local_workspace_links(project_id);

CREATE INDEX idx_local_workspace_links_issue_id
    ON local_workspace_links(issue_id);

INSERT INTO local_workspace_links (workspace_id, project_id, issue_id)
SELECT
    w.id,
    i.project_id,
    i.id
FROM workspaces w
JOIN local_issues i ON i.id = w.task_id;
