-- Add tables to Electric publication for sync
-- These tables need REPLICA IDENTITY FULL for Electric to track changes

SELECT electric_sync_table('public', 'users');
SELECT electric_sync_table('public', 'projects');
SELECT electric_sync_table('public', 'project_statuses');
SELECT electric_sync_table('public', 'tags');
SELECT electric_sync_table('public', 'issues');
SELECT electric_sync_table('public', 'issue_assignees');
SELECT electric_sync_table('public', 'issue_followers');
SELECT electric_sync_table('public', 'issue_tags');
SELECT electric_sync_table('public', 'issue_comments');
SELECT electric_sync_table('public', 'issue_relationships');
SELECT electric_sync_table('public', 'issue_comment_reactions');
SELECT electric_sync_table('public', 'notifications');
SELECT electric_sync_table('public', 'organization_member_metadata');
SELECT electric_sync_table('public', 'workspaces');
SELECT electric_sync_table('public', 'pull_requests');

-- Add indexes for subquery performance
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_statuses_project_id ON project_statuses(project_id);
CREATE INDEX IF NOT EXISTS idx_tags_project_id ON tags(project_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignees_issue_id ON issue_assignees(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_followers_issue_id ON issue_followers(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_tags_issue_id ON issue_tags(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_relationships_issue_id ON issue_relationships(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comment_reactions_comment_id ON issue_comment_reactions(comment_id);
