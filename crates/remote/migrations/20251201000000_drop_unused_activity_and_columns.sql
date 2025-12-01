-- Drop activity feed tables and functions
DROP TABLE IF EXISTS activity CASCADE;
DROP TABLE IF EXISTS project_activity_counters;
DROP FUNCTION IF EXISTS ensure_activity_partition;
DROP FUNCTION IF EXISTS activity_notify;

-- Drop unused columns from shared_tasks
ALTER TABLE shared_tasks DROP COLUMN IF EXISTS version;
ALTER TABLE shared_tasks DROP COLUMN IF EXISTS last_event_seq;
