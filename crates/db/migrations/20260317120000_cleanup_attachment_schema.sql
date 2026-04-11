COMMIT;

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

ALTER TABLE images RENAME TO attachments;
ALTER TABLE task_images RENAME TO task_attachments;
ALTER TABLE task_attachments RENAME COLUMN image_id TO attachment_id;
ALTER TABLE workspace_images RENAME TO workspace_attachments;
ALTER TABLE workspace_attachments RENAME COLUMN image_id TO attachment_id;

DROP INDEX IF EXISTS idx_images_hash;
DROP INDEX IF EXISTS idx_task_images_task_id;
DROP INDEX IF EXISTS idx_task_images_image_id;
DROP INDEX IF EXISTS idx_workspace_images_workspace_id;
DROP INDEX IF EXISTS idx_workspace_images_image_id;

CREATE INDEX idx_attachments_hash ON attachments(hash);
CREATE INDEX idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX idx_task_attachments_attachment_id ON task_attachments(attachment_id);
CREATE INDEX idx_workspace_attachments_workspace_id
    ON workspace_attachments(workspace_id);
CREATE INDEX idx_workspace_attachments_attachment_id
    ON workspace_attachments(attachment_id);


PRAGMA foreign_key_check;

COMMIT;

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;
