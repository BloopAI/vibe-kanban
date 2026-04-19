CREATE TABLE IF NOT EXISTS p2p_hosts (
    id          TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    address     TEXT NOT NULL,
    relay_port  INTEGER NOT NULL DEFAULT 8081,
    machine_id  TEXT NOT NULL,
    session_token TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    last_connected_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS p2p_pairing_attempts (
    id          TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    ip_address  TEXT NOT NULL,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    succeeded   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_p2p_pairing_attempts_ip
    ON p2p_pairing_attempts(ip_address, attempted_at);
