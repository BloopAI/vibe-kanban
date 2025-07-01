-- Add assistant_message column to executor_sessions table
ALTER TABLE executor_sessions ADD COLUMN assistant_message TEXT;
