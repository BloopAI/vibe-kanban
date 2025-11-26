CREATE TABLE scratch (
    id           BLOB NOT NULL,
    scratch_type TEXT NOT NULL,
    payload      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    PRIMARY KEY (id, scratch_type)
);

CREATE INDEX idx_scratch_created_at ON scratch(created_at);
