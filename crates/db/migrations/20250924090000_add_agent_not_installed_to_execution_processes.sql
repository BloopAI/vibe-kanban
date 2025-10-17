ALTER TABLE execution_processes
    ADD COLUMN agent_not_installed BOOLEAN NOT NULL DEFAULT 0;
