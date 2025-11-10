-- Replace device authorization tables with authorization-code handoffs.

DROP TABLE IF EXISTS oauth_device_authorizations;

CREATE TABLE IF NOT EXISTS oauth_handoffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL,
    state           TEXT NOT NULL,
    return_to       TEXT NOT NULL,
    app_challenge   TEXT NOT NULL,
    app_code_hash   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_code      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    authorized_at   TIMESTAMPTZ,
    redeemed_at     TIMESTAMPTZ,
    user_id         TEXT REFERENCES users(id),
    session_id      UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_status
    ON oauth_handoffs (status);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_user
    ON oauth_handoffs (user_id);
