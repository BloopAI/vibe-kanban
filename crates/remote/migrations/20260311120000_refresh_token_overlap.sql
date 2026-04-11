ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS previous_refresh_token_id UUID,
    ADD COLUMN IF NOT EXISTS previous_refresh_token_grace_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_previous_refresh_id
    ON auth_sessions (previous_refresh_token_id);
