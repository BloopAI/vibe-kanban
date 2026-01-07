-- Migration steps following the official SQLite "12-step generalized ALTER TABLE" procedure:
-- https://www.sqlite.org/lang_altertable.html#otheralter
--
PRAGMA foreign_keys = OFF;

-- This is a sqlx workaround to enable BEGIN TRANSACTION in this migration, until `-- no-transaction` lands in sqlx-sqlite.
-- https://github.com/launchbadge/sqlx/issues/2085#issuecomment-1499859906
COMMIT TRANSACTION;

BEGIN TRANSACTION;

-- Create replacement table without the PRIMARY KEY constraint on execution_id.
CREATE TABLE execution_process_logs_new (
    execution_id      BLOB NOT NULL,
    logs              TEXT NOT NULL,      -- JSONL format (one LogMsg per line)
    byte_size         INTEGER NOT NULL,
    inserted_at       TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

-- Copy existing data into the replacement table.
INSERT INTO execution_process_logs_new (
    execution_id,
    logs,
    byte_size,
    inserted_at
)
SELECT
    execution_id,
    logs,
    byte_size,
    inserted_at
FROM execution_process_logs;

-- Drop the original table.
DROP TABLE execution_process_logs;

-- Rename the new table into place.
ALTER TABLE execution_process_logs_new RENAME TO execution_process_logs;

-- Rebuild indexes to preserve performance characteristics.
CREATE INDEX IF NOT EXISTS idx_execution_process_logs_execution_id_inserted_at
    ON execution_process_logs (execution_id, inserted_at);

-- Verify foreign key constraints before committing the transaction.
PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

-- sqlx workaround due to lack of `-- no-transaction` in sqlx-sqlite.
BEGIN TRANSACTION;
