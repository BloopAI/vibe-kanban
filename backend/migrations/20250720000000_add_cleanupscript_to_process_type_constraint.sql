-- 1. Add the replacement column with the wider CHECK
ALTER TABLE execution_processes
  ADD COLUMN process_type_new TEXT NOT NULL DEFAULT 'setupscript'
    CHECK (process_type_new IN ('setupscript',
                                'cleanupscript',   -- new value 🎉
                                'codingagent',
                                'devserver'));

-- 2. Copy existing values across
UPDATE execution_processes
  SET process_type_new = process_type;

-- 3. Drop any indexes that mention the old column
DROP INDEX IF EXISTS idx_execution_processes_type;

-- 4. Remove the old column (requires 3.35+)
ALTER TABLE execution_processes DROP COLUMN process_type;

-- 5. Rename the new column back to the canonical name
ALTER TABLE execution_processes
  RENAME COLUMN process_type_new TO process_type;

-- 6. Re-create the index
CREATE INDEX idx_execution_processes_type
        ON execution_processes(process_type);