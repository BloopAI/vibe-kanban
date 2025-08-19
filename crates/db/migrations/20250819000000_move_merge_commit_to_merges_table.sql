-- Create new merges table to track multiple merges per task attempt
CREATE TABLE merges (
    id              BLOB PRIMARY KEY,
    task_attempt_id BLOB NOT NULL,
    merge_commit    TEXT NOT NULL,
    merged_at       TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);

-- Migrate existing merge_commit data to new table
INSERT INTO merges (id, task_attempt_id, merge_commit, merged_at)
SELECT 
    randomblob(16),
    id,
    merge_commit,
    updated_at
FROM task_attempts
WHERE merge_commit IS NOT NULL;

-- Drop merge_commit column from task_attempts
ALTER TABLE task_attempts DROP COLUMN merge_commit;