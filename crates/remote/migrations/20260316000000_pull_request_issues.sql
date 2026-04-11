-- Scope pull_requests per project and introduce many-to-many pull_request_issues join table.
-- Deprecated columns (issue_id, workspace_id) are kept for backward compat with old
-- ElectricSQL shapes and API clients. issue_id is write-once (set at creation).

-- 1. Add project_id, backfill from existing issue_id
ALTER TABLE pull_requests ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
UPDATE pull_requests SET project_id = (SELECT project_id FROM issues WHERE id = pull_requests.issue_id);
ALTER TABLE pull_requests ALTER COLUMN project_id SET NOT NULL;
CREATE INDEX idx_pull_requests_project_id ON pull_requests(project_id);

-- 2. Change unique constraint: UNIQUE(url) -> UNIQUE(url, project_id)
ALTER TABLE pull_requests DROP CONSTRAINT pull_requests_url_key;
ALTER TABLE pull_requests ADD CONSTRAINT pull_requests_url_project_key UNIQUE (url, project_id);

-- 3. Create pull_request_issues join table (many-to-many)
CREATE TABLE pull_request_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    UNIQUE (pull_request_id, issue_id)
);

CREATE INDEX idx_pull_request_issues_issue ON pull_request_issues(issue_id);
CREATE INDEX idx_pull_request_issues_pr ON pull_request_issues(pull_request_id);

-- Migrate existing data from the old issue_id column
INSERT INTO pull_request_issues (pull_request_id, issue_id)
SELECT id, issue_id FROM pull_requests;

SELECT electric_sync_table('public', 'pull_request_issues');
