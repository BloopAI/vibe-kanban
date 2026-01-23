-- Add agent_message_uuid column to coding_agent_turns
-- This stores the last user message UUID from Claude for use with --resume-session-at
ALTER TABLE coding_agent_turns ADD COLUMN agent_message_uuid TEXT;
