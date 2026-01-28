-- Add agent_message_id column to coding_agent_turns
-- This stores the last message ID from the agent for use with --resume-session-at
ALTER TABLE coding_agent_turns ADD COLUMN agent_message_id TEXT;
