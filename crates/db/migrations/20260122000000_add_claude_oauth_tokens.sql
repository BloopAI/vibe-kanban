PRAGMA foreign_keys = ON;

-- Store Claude Code OAuth tokens per user for subscription rotation
CREATE TABLE claude_oauth_tokens (
    id              BLOB PRIMARY KEY,
    user_id         BLOB NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    encrypted_token TEXT NOT NULL,
    token_hint      TEXT,  -- Last 4 chars for display (e.g., "...abc1")
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    expires_at      TEXT,
    last_used_at    TEXT
);

CREATE INDEX idx_claude_oauth_tokens_user_id ON claude_oauth_tokens(user_id);
CREATE INDEX idx_claude_oauth_tokens_last_used_at ON claude_oauth_tokens(last_used_at);
