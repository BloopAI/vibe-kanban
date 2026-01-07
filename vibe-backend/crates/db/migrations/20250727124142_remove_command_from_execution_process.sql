-- Add migration script here

ALTER TABLE execution_processes DROP COLUMN command;
ALTER TABLE execution_processes DROP COLUMN args;