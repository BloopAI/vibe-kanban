-- Add migration script here

ALTER TABLE execution_processes DROP COLUMN stdout;
ALTER TABLE execution_processes DROP COLUMN stderr;