CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gh_pr_url TEXT NOT NULL,
    claude_code_session_id TEXT,
    ip_address INET NOT NULL,
    review_cache JSONB,
    last_viewed_at TIMESTAMPTZ,
    r2_path TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email TEXT NOT NULL,
    pr_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);

-- Index for rate limiting queries (IP + time range)
CREATE INDEX IF NOT EXISTS idx_reviews_ip_created ON reviews (ip_address, created_at);
