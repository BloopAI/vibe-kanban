PRAGMA foreign_keys = ON;

-- Rename base_coding_agent column to profile_label for better semantic clarity
ALTER TABLE task_attempts RENAME COLUMN base_coding_agent TO profile;
-- best effort attempt to not break older task attempts by mapping to profiles
UPDATE task_attempts
SET profile = CASE profile
    WHEN 'CLAUDE_CODE' THEN 'claude-code'
    WHEN 'CODEX' THEN 'codex'
    WHEN 'GEMINI' THEN 'gemini'
    WHEN 'AMP' THEN 'amp'
    WHEN 'OPENCODE' THEN 'opencode'
END
WHERE profile IS NOT NULL
  AND profile IN ('CLAUDE_CODE', 'CODEX', 'GEMINI', 'AMP', 'OPENCODE');
