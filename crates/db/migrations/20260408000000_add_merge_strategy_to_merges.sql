-- Track which merge strategy was used for direct merges.
-- Allowed values: 'squash' (legacy default), 'rebase', 'merge' (no-ff merge commit).
ALTER TABLE merges ADD COLUMN merge_strategy TEXT NOT NULL DEFAULT 'squash';
