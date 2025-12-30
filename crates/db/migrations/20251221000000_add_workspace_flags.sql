-- Add workspace flags for archived, pinned, and name
ALTER TABLE workspaces ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN name TEXT;
