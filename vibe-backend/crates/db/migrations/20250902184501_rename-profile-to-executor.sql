-- Add migration script here

ALTER TABLE task_attempts RENAME COLUMN profile TO executor;
