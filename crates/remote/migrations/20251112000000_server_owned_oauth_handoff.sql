-- Add server verifier support for backend-managed OAuth flows (e.g., invitation acceptance)
ALTER TABLE oauth_handoffs
    ADD COLUMN server_verifier TEXT NULL;
