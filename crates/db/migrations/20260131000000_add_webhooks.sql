CREATE TABLE webhooks (
    id               BLOB NOT NULL PRIMARY KEY,
    project_id       BLOB REFERENCES projects(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    url              TEXT NOT NULL,
    events           TEXT NOT NULL DEFAULT '["executor_finish"]',
    headers          TEXT NOT NULL DEFAULT '{}',
    secret           TEXT,
    payload_template TEXT,
    override_global  INTEGER NOT NULL DEFAULT 0,
    active           INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);
CREATE INDEX idx_webhooks_project_id ON webhooks(project_id);
