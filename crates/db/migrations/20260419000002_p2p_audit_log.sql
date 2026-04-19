CREATE TABLE IF NOT EXISTS p2p_audit_log (
    id           TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    event_type   TEXT NOT NULL,
    host_id      TEXT,
    ip_address   TEXT,
    detail       TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES p2p_hosts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_p2p_audit_log_host_id
    ON p2p_audit_log(host_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_p2p_audit_log_event_type
    ON p2p_audit_log(event_type, created_at DESC);
