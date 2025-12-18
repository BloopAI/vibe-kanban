-- Add organization_id foreign key to reviews
ALTER TABLE reviews
ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Create index for organization queries
CREATE INDEX idx_reviews_organization ON reviews(organization_id);

-- Backfill existing webhook reviews from github_app_installations
UPDATE reviews r
SET organization_id = gai.organization_id
FROM github_app_installations gai
WHERE r.github_installation_id = gai.github_installation_id
AND r.github_installation_id IS NOT NULL;
