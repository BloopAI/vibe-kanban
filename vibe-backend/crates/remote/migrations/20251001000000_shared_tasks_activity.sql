CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    is_personal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL UNIQUE,
    first_name   TEXT,
    last_name    TEXT,
    username     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    CREATE TYPE member_role AS ENUM ('admin', 'member');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS organization_member_metadata (
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role            member_role NOT NULL DEFAULT 'member',
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at    TIMESTAMPTZ,
        PRIMARY KEY (organization_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_member_metadata_user
    ON organization_member_metadata (user_id);

CREATE INDEX IF NOT EXISTS idx_member_metadata_org_role
    ON organization_member_metadata (organization_id, role);

DO $$
BEGIN
    CREATE TYPE task_status AS ENUM ('todo', 'in-progress', 'in-review', 'done', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_org_name
    ON projects (organization_id, name);

CREATE TABLE IF NOT EXISTS project_activity_counters (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    last_seq BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_tasks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    creator_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    assignee_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    status             task_status NOT NULL DEFAULT 'todo'::task_status,
    version            BIGINT NOT NULL DEFAULT 1,
    deleted_at         TIMESTAMPTZ,
    shared_at          TIMESTAMPTZ DEFAULT NOW(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_status
    ON shared_tasks (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_org_assignee
    ON shared_tasks (organization_id, assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project
    ON shared_tasks (project_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_org_deleted_at
    ON shared_tasks (organization_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

-- Partitioned activity feed (24-hour range partitions on created_at).
CREATE TABLE activity (
    seq               BIGINT NOT NULL,
    event_id          UUID NOT NULL DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type        TEXT NOT NULL,
    payload           JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (created_at, project_id, seq),
    UNIQUE (created_at, event_id)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_activity_project_seq
    ON activity (project_id, seq DESC);

-- Create partitions on demand for the 24-hour window that contains target_ts.
CREATE FUNCTION ensure_activity_partition(target_ts TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    bucket_seconds CONSTANT INTEGER := 24 * 60 * 60;
    bucket_start   TIMESTAMPTZ;
    bucket_end     TIMESTAMPTZ;
    partition_name TEXT;
BEGIN
    bucket_start := to_timestamp(
        floor(EXTRACT(EPOCH FROM target_ts) / bucket_seconds) * bucket_seconds
    );
    bucket_end := bucket_start + INTERVAL '24 hours';
    partition_name := format(
        'activity_p_%s',
        to_char(bucket_start AT TIME ZONE 'UTC', 'YYYYMMDD')
    );

    BEGIN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF activity FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            bucket_start,
            bucket_end
        );
    EXCEPTION
        WHEN duplicate_table THEN
            NULL;
    END;
END;
$$;

-- Seed partitions for the current and next 2 days (48 hours) for safety.
-- This ensures partitions exist even if cron job fails temporarily.
SELECT ensure_activity_partition(NOW());
SELECT ensure_activity_partition(NOW() + INTERVAL '24 hours');
SELECT ensure_activity_partition(NOW() + INTERVAL '48 hours');

DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_activity_notify ON activity;
EXCEPTION
    WHEN undefined_object THEN NULL;
END
$$;

DO $$
BEGIN
    DROP FUNCTION IF EXISTS activity_notify();
EXCEPTION
    WHEN undefined_function THEN NULL;
END
$$;

CREATE FUNCTION activity_notify() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify(
        'activity',
        json_build_object(
            'seq', NEW.seq,
            'event_id', NEW.event_id,
            'project_id', NEW.project_id,
            'event_type', NEW.event_type,
            'created_at', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_activity_notify
    AFTER INSERT ON activity
    FOR EACH ROW
    EXECUTE FUNCTION activity_notify();

DO $$
BEGIN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS organization_invitations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    email               TEXT NOT NULL,
    role                member_role NOT NULL DEFAULT 'member',
    status              invitation_status NOT NULL DEFAULT 'pending',
    token               TEXT NOT NULL UNIQUE,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org
    ON organization_invitations (organization_id);

CREATE INDEX IF NOT EXISTS idx_org_invites_status_expires
    ON organization_invitations (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_invite_per_email_per_org
    ON organization_invitations (organization_id, lower(email))
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS auth_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_secret_hash TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions (user_id);

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
    user_id         UUID REFERENCES users(id),
    session_id      UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_status
    ON oauth_handoffs (status);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_user
    ON oauth_handoffs (user_id);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shared_tasks_updated_at
    BEFORE UPDATE ON shared_tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_org_invites_updated_at
    BEFORE UPDATE ON organization_invitations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oauth_accounts_updated_at
    BEFORE UPDATE ON oauth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oauth_handoffs_updated_at
    BEFORE UPDATE ON oauth_handoffs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION set_last_used_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_used_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auth_sessions_last_used_at
BEFORE UPDATE ON auth_sessions
FOR EACH ROW
EXECUTE FUNCTION set_last_used_at();
