ALTER TABLE oauth_accounts
ADD COLUMN IF NOT EXISTS encrypted_provider_tokens TEXT;
