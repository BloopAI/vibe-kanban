-- Unify follow_up_drafts and retry_drafts into a single drafts table
-- This migration consolidates the duplicate code between the two draft types

-- Create the unified drafts table
CREATE TABLE IF NOT EXISTS drafts (
    id                TEXT PRIMARY KEY,
    task_attempt_id   TEXT NOT NULL,
    draft_type        TEXT NOT NULL CHECK(draft_type IN ('follow_up', 'retry')),
    retry_process_id  TEXT NULL, -- Only used for retry drafts
    prompt            TEXT NOT NULL DEFAULT '',
    queued            INTEGER NOT NULL DEFAULT 0,
    sending           INTEGER NOT NULL DEFAULT 0,
    version           INTEGER NOT NULL DEFAULT 0,
    variant           TEXT NULL,
    image_ids         TEXT NULL, -- JSON array of UUID strings
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY(retry_process_id) REFERENCES execution_processes(id) ON DELETE CASCADE,
    -- Unique constraint: only one draft per task_attempt_id and draft_type
    UNIQUE(task_attempt_id, draft_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drafts_task_attempt_id
    ON drafts(task_attempt_id);

CREATE INDEX IF NOT EXISTS idx_drafts_draft_type
    ON drafts(draft_type);

CREATE INDEX IF NOT EXISTS idx_drafts_queued_sending
    ON drafts(queued, sending) WHERE queued = 1;

-- Migrate existing follow_up_drafts
INSERT INTO drafts (
    id, task_attempt_id, draft_type, retry_process_id, prompt,
    queued, sending, version, variant, image_ids, created_at, updated_at
)
SELECT
    id, task_attempt_id, 'follow_up', NULL, prompt,
    queued, sending, version, variant, image_ids, created_at, updated_at
FROM follow_up_drafts;

-- Drop old tables
DROP TABLE IF EXISTS follow_up_drafts;

-- Create trigger to keep updated_at current
CREATE TRIGGER IF NOT EXISTS trg_drafts_updated_at
AFTER UPDATE ON drafts
FOR EACH ROW
BEGIN
    UPDATE drafts SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;