-- Add after_head_commit column to store commit OID after a process ends
ALTER TABLE execution_processes
    ADD COLUMN after_head_commit TEXT;

