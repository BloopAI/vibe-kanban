-- Add before_head_commit column to store commit OID before a process starts
ALTER TABLE execution_processes
    ADD COLUMN before_head_commit TEXT;

-- Backfill before_head_commit for legacy rows using the previous process's after_head_commit
UPDATE execution_processes AS ep
SET before_head_commit = (
  SELECT prev.after_head_commit
  FROM execution_processes prev
  WHERE prev.task_attempt_id = ep.task_attempt_id
    AND prev.created_at = (
      SELECT max(created_at) FROM execution_processes
      WHERE task_attempt_id = ep.task_attempt_id AND created_at < ep.created_at
    )
)
WHERE ep.before_head_commit IS NULL
  AND ep.after_head_commit IS NOT NULL;
