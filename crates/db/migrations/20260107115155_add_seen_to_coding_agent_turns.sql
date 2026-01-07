-- Add 'seen' column to coding_agent_turns table
-- New turns default to unseen (0), marked as seen (1) when user views the workspace
ALTER TABLE coding_agent_turns ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;
