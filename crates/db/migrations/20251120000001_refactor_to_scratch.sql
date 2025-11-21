DROP TABLE IF EXISTS user_messages;

CREATE TABLE scratch (
    id           BLOB PRIMARY KEY,
    payload_type TEXT NOT NULL,
    payload      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_scratch_created_at ON scratch(created_at);
