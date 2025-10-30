ALTER TABLE shared_tasks
    ADD COLUMN assignee_first_name TEXT;

ALTER TABLE shared_tasks
    ADD COLUMN assignee_last_name TEXT;

ALTER TABLE shared_tasks
    ADD COLUMN assignee_username TEXT;
