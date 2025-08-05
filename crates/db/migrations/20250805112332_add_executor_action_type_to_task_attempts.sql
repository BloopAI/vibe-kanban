-- Remove unused executor_type column from execution_processes
ALTER TABLE execution_processes DROP COLUMN executor_type;

-- Add executor_action_type column to task_attempts table
ALTER TABLE task_attempts ADD COLUMN executor_action_type TEXT;

-- Update existing records based on executor profile names
-- Using SCREAMING_SNAKE_CASE as per the serde configuration
UPDATE task_attempts 
SET executor_action_type = 
    CASE 
        WHEN executor IN ('claude-code', 'claude-code-plan', 'claude-code-router') THEN 'CLAUDE_CODE'
        WHEN executor IN ('amp', 'fast-amp') THEN 'AMP'
        WHEN executor IN ('gemini', 'gemini-pro') THEN 'GEMINI'
        ELSE NULL
    END
WHERE executor IS NOT NULL;
