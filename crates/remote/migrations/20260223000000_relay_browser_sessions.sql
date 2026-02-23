CREATE TABLE relay_browser_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auth_session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_relay_browser_sessions_host_id
    ON relay_browser_sessions(host_id);
CREATE INDEX idx_relay_browser_sessions_user_id
    ON relay_browser_sessions(user_id);
CREATE INDEX idx_relay_browser_sessions_auth_session_id
    ON relay_browser_sessions(auth_session_id);
CREATE INDEX idx_relay_browser_sessions_active
    ON relay_browser_sessions(host_id, user_id)
    WHERE revoked_at IS NULL;
