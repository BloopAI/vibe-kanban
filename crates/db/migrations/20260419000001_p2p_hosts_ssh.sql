-- Add SSH tunnel configuration columns to p2p_hosts
ALTER TABLE p2p_hosts ADD COLUMN ssh_user TEXT;
ALTER TABLE p2p_hosts ADD COLUMN ssh_port INTEGER NOT NULL DEFAULT 22;
ALTER TABLE p2p_hosts ADD COLUMN ssh_key_path TEXT;
ALTER TABLE p2p_hosts ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'auto';
-- connection_mode: 'direct' | 'ssh' | 'auto'
-- 'auto' = try direct WS first, fall back to SSH tunnel

ALTER TABLE p2p_hosts ADD COLUMN known_host_key TEXT;
-- SHA256:base64 fingerprint of the remote SSH host key (trust-on-first-use)
