-- Add column with empty default first
ALTER TABLE projects ADD COLUMN agent_working_dir TEXT DEFAULT '';

-- Copy existing dev_script_working_dir values to agent_working_dir
UPDATE projects SET agent_working_dir = dev_script_working_dir WHERE dev_script_working_dir IS NOT NULL AND dev_script_working_dir != '';
