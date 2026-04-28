-- External sessions: agent sessions registered from outside VK
-- (terminal Claude Code, Gemini, Zora tasks, etc.)
-- Separate table to avoid touching the internal sessions schema.
CREATE TABLE IF NOT EXISTS external_sessions (
  id                   TEXT PRIMARY KEY NOT NULL,
  name                 TEXT,
  runtime              TEXT NOT NULL DEFAULT 'unknown',
  project_path         TEXT,
  branch               TEXT,
  pid                  INTEGER,
  status               TEXT NOT NULL DEFAULT 'in_progress',
  created_at           DATETIME NOT NULL DEFAULT (datetime('now', 'subsec')),
  updated_at           DATETIME NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX IF NOT EXISTS idx_external_sessions_status
  ON external_sessions (status);
CREATE INDEX IF NOT EXISTS idx_external_sessions_project
  ON external_sessions (project_path);
