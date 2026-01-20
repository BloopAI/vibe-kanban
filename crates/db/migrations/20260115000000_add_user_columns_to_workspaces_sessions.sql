-- Phase 4: Workspace & Session Ownership
-- Add owner_user_id to track who created/owns the workspace
-- Add initiated_by_user_id to track who started the session

ALTER TABLE workspaces ADD COLUMN owner_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN initiated_by_user_id BLOB REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_workspaces_owner_user_id ON workspaces(owner_user_id);
CREATE INDEX idx_sessions_initiated_by_user_id ON sessions(initiated_by_user_id);
