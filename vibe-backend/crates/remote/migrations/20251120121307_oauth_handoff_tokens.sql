ALTER TABLE oauth_handoffs
ADD COLUMN IF NOT EXISTS encrypted_provider_tokens TEXT;
