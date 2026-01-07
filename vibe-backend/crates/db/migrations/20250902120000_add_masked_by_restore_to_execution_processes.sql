-- Add a boolean flag to mark processes as dropped (excluded from timeline/logs)
ALTER TABLE execution_processes
    ADD COLUMN dropped BOOLEAN NOT NULL DEFAULT 0;
