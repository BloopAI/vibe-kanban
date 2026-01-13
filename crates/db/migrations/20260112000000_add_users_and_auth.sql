-- Add users table for local authentication
CREATE TABLE users (
    id            BLOB PRIMARY KEY,
    github_id     INTEGER NOT NULL UNIQUE,
    username      TEXT NOT NULL,
    email         TEXT,
    display_name  TEXT,
    avatar_url    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Add auth_sessions table for JWT session management
CREATE TABLE auth_sessions (
    id                  BLOB PRIMARY KEY,
    user_id             BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          TEXT NOT NULL,
    expires_at          TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    last_used_at        TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    revoked_at          TEXT
);

CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_token_hash ON auth_sessions(token_hash);
