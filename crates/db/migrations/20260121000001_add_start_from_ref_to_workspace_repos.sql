-- Add start_from_ref column to workspace_repos for branching from specific commits
ALTER TABLE workspace_repos ADD COLUMN start_from_ref TEXT;
