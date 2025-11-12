-- Add server-owned OAuth handoff support for backend-managed flows (e.g., invitation acceptance)
ALTER TABLE oauth_handoffs
    ADD COLUMN server_owned BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN server_verifier TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_server_owned
    ON oauth_handoffs (server_owned)
    WHERE server_owned = true;
