CREATE TABLE hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    machine_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'online')),
    last_seen_at TIMESTAMPTZ,
    agent_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hosts_owner_user_id ON hosts(owner_user_id);
CREATE UNIQUE INDEX idx_hosts_owner_user_id_machine_id ON hosts(owner_user_id, machine_id);
CREATE INDEX idx_hosts_shared_with_organization_id ON hosts(shared_with_organization_id);
CREATE INDEX idx_hosts_last_seen_at ON hosts(last_seen_at DESC);

CREATE TABLE relay_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    request_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('requested', 'active', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE INDEX idx_relay_sessions_host_id ON relay_sessions(host_id);
CREATE INDEX idx_relay_sessions_request_user_id ON relay_sessions(request_user_id);
CREATE INDEX idx_relay_sessions_state_expires_at ON relay_sessions(state, expires_at);

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

CREATE TABLE relay_auth_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash TEXT NOT NULL UNIQUE,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    relay_cookie_value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_relay_auth_codes_host_id ON relay_auth_codes(host_id);
CREATE INDEX idx_relay_auth_codes_expires_at ON relay_auth_codes(expires_at);
