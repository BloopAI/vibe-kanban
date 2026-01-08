-- Add GitHub issue tracking fields to tasks table
-- These fields link tasks to their source GitHub issues for PR integration

ALTER TABLE tasks ADD COLUMN github_issue_number INTEGER;
ALTER TABLE tasks ADD COLUMN github_issue_url TEXT;
