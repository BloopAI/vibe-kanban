-- Add CI status column to merges table for tracking GitHub Actions / CI check status
ALTER TABLE merges ADD COLUMN pr_ci_status TEXT DEFAULT NULL;
