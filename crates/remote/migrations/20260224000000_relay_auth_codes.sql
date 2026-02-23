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
