PRAGMA foreign_keys = ON;

ALTER TABLE tasks
    ADD COLUMN shared_task_id BLOB REFERENCES shared_tasks(id) ON DELETE SET NULL;
