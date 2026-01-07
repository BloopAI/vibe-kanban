ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_token_id UUID;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_token_issued_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh_id
    ON auth_sessions (refresh_token_id);

CREATE TABLE IF NOT EXISTS revoked_refresh_tokens (
    token_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user
    ON revoked_refresh_tokens (user_id);
