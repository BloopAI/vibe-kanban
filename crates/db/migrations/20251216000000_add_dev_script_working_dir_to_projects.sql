-- Add dev_script_working_dir column to projects table
ALTER TABLE projects ADD COLUMN dev_script_working_dir TEXT DEFAULT '';
