-- crates/remote/migrations/20260323100000_slack_integration.sql
CREATE TABLE slack_project_connections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    channel_id          TEXT        NOT NULL,
    encrypted_bot_token TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id)
);
