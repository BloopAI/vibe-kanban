-- Follow-up drafts per task attempt
-- Stores a single draft prompt that can be queued for the next available run

CREATE TABLE IF NOT EXISTS follow_up_drafts (
    id               TEXT PRIMARY KEY,
    task_attempt_id  TEXT NOT NULL UNIQUE,
    prompt           TEXT NOT NULL DEFAULT '',
    queued           INTEGER NOT NULL DEFAULT 0,
    sending          INTEGER NOT NULL DEFAULT 0,
    version          INTEGER NOT NULL DEFAULT 0,
    variant          TEXT NULL,
    image_ids        TEXT NULL, -- JSON array of UUID strings
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_attempt_id) REFERENCES task_attempts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_follow_up_drafts_task_attempt_id
    ON follow_up_drafts(task_attempt_id);

-- Trigger to keep updated_at current
CREATE TRIGGER IF NOT EXISTS trg_follow_up_drafts_updated_at
AFTER UPDATE ON follow_up_drafts
FOR EACH ROW
BEGIN
    UPDATE follow_up_drafts SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
