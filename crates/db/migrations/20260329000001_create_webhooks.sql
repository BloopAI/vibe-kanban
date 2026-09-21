CREATE TABLE IF NOT EXISTS webhooks (
    id          TEXT PRIMARY KEY NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT,
    description TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  DATETIME NOT NULL DEFAULT (datetime('now', 'subsec'))
);
