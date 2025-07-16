-- Migration to update executor type names from snake_case/camelCase to kebab-case
-- This handles the change from charmopencode -> charm-opencode and setup_script -> setup-script

-- Update task_attempts.executor column
UPDATE task_attempts 
SET executor = 'charm-opencode' 
WHERE executor = 'charmopencode';

UPDATE task_attempts 
SET executor = 'setup-script' 
WHERE executor = 'setup_script';

-- Update execution_processes.executor_type column
UPDATE execution_processes 
SET executor_type = 'charm-opencode' 
WHERE executor_type = 'charmopencode';

UPDATE execution_processes 
SET executor_type = 'setup-script' 
WHERE executor_type = 'setup_script';