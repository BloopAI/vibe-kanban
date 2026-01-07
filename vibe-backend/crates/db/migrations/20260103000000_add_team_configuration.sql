-- Add team configuration columns for agent execution
ALTER TABLE teams ADD COLUMN dev_script TEXT;
ALTER TABLE teams ADD COLUMN dev_script_working_dir TEXT;
ALTER TABLE teams ADD COLUMN default_agent_working_dir TEXT;
