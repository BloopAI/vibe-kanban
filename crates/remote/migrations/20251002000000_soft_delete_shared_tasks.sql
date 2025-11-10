ALTER TABLE shared_tasks
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shared_tasks_org_deleted_at
    ON shared_tasks (organization_id, deleted_at)
    WHERE deleted_at IS NOT NULL;
