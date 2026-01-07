-- Add review_enabled column to allow users to toggle which repos are reviewed
ALTER TABLE github_app_repositories
ADD COLUMN review_enabled BOOLEAN NOT NULL DEFAULT true;

-- Index for efficient filtering during webhook processing
CREATE INDEX idx_github_app_repos_review_enabled
ON github_app_repositories(installation_id, review_enabled)
WHERE review_enabled = true;
