-- Make email and ip_address nullable for webhook-triggered reviews
ALTER TABLE reviews
ALTER COLUMN email DROP NOT NULL,
ALTER COLUMN ip_address DROP NOT NULL;

-- Add webhook-specific columns
ALTER TABLE reviews
ADD COLUMN github_installation_id BIGINT,
ADD COLUMN pr_owner TEXT,
ADD COLUMN pr_repo TEXT,
ADD COLUMN pr_number INTEGER;

-- Index for webhook reviews
CREATE INDEX idx_reviews_webhook ON reviews (github_installation_id)
WHERE github_installation_id IS NOT NULL;
