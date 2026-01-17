-- Add jira_cache table for caching Jira ticket responses
-- Cache entries expire after 5 minutes (TTL managed in application code)

CREATE TABLE jira_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key       TEXT NOT NULL UNIQUE,
    data            TEXT NOT NULL,  -- JSON serialized JiraIssuesResponse
    cached_at       TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

-- Index for fast lookup by cache key
CREATE INDEX idx_jira_cache_cache_key ON jira_cache(cache_key);

-- Index for cleaning up stale entries by timestamp
CREATE INDEX idx_jira_cache_cached_at ON jira_cache(cached_at);
