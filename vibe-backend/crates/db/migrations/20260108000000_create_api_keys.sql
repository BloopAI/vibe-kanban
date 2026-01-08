-- API keys for programmatic access (MCP servers, CLI tools, etc.)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,           -- Clerk user ID
    name TEXT NOT NULL,              -- Human-readable name for the key
    key_prefix TEXT NOT NULL,        -- First 8 chars of key for identification (e.g., "vk_abc123")
    key_hash TEXT NOT NULL,          -- SHA-256 hash of the full key
    scopes TEXT[] DEFAULT '{}',      -- Optional: specific permissions (future use)
    last_used_at TIMESTAMPTZ,        -- Track usage
    expires_at TIMESTAMPTZ,          -- Optional expiration
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up keys by hash (primary lookup path)
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE NOT is_revoked;

-- Index for listing user's keys
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();
