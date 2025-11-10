CREATE TABLE IF NOT EXISTS auth_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_secret  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS oauth_device_authorizations (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                    TEXT NOT NULL,
    device_code                 TEXT NOT NULL UNIQUE,
    user_code                   TEXT NOT NULL,
    verification_uri            TEXT NOT NULL,
    verification_uri_complete   TEXT,
    expires_at                  TIMESTAMPTZ NOT NULL,
    polling_interval            INTEGER NOT NULL,
    last_polled_at              TIMESTAMPTZ,
    status                      TEXT NOT NULL DEFAULT 'pending',
    error_code                  TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at                TIMESTAMPTZ,
    user_id                     UUID REFERENCES users(id),
    session_id                  UUID REFERENCES auth_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_device_authorizations_status
    ON oauth_device_authorizations (status);

CREATE INDEX IF NOT EXISTS idx_oauth_device_authorizations_user
    ON oauth_device_authorizations (user_id);

CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    provider_user_id  TEXT NOT NULL,
    email             TEXT,
    username          TEXT,
    display_name      TEXT,
    avatar_url        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user
    ON oauth_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user
    ON oauth_accounts (provider, provider_user_id);
