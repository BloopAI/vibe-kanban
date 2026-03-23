-- crates/remote/migrations/20260323000000_linear_integration.sql

CREATE TABLE linear_project_connections (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    linear_team_id       TEXT NOT NULL,
    linear_project_id    TEXT,
    encrypted_api_key    TEXT NOT NULL,
    linear_webhook_id    TEXT,
    linear_webhook_secret TEXT,  -- stored plain; server-generated, lower risk than API key
    sync_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE linear_issue_links (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vk_issue_id               UUID NOT NULL UNIQUE REFERENCES issues(id) ON DELETE CASCADE,
    linear_issue_id           TEXT NOT NULL,
    linear_issue_identifier   TEXT NOT NULL,
    last_synced_at            TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_linear_issue_id UNIQUE (linear_issue_id)
);

CREATE TABLE linear_status_mappings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    vk_status_id        UUID NOT NULL REFERENCES project_statuses(id) ON DELETE CASCADE,
    linear_state_id     TEXT NOT NULL,
    linear_state_name   TEXT NOT NULL,
    CONSTRAINT uq_status_mapping UNIQUE (connection_id, vk_status_id)
);

CREATE TABLE linear_label_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    vk_tag_id           UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    linear_label_id     TEXT NOT NULL,
    linear_label_name   TEXT NOT NULL,
    CONSTRAINT uq_label_link UNIQUE (connection_id, vk_tag_id)
);

CREATE TABLE linear_comment_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    vk_comment_id       UUID NOT NULL UNIQUE REFERENCES issue_comments(id) ON DELETE CASCADE,
    linear_comment_id   TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_comment_link_per_conn UNIQUE (connection_id, linear_comment_id)
);

CREATE TABLE linear_sync_in_flight (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    issue_id        UUID NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    expires_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_sync_in_flight UNIQUE (connection_id, issue_id, direction)
);
CREATE INDEX idx_linear_sync_in_flight_expiry ON linear_sync_in_flight(expires_at);

-- Electrify linear_project_connections so frontend gets real-time updates
SELECT electric_sync_table('public', 'linear_project_connections');
