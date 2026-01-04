-- Task-Document Links: Links tasks/issues to team documents
CREATE TABLE IF NOT EXISTS task_document_links (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(task_id, document_id)
);

-- Index for fast lookups by task
CREATE INDEX IF NOT EXISTS idx_task_document_links_task_id ON task_document_links(task_id);

-- Index for fast lookups by document
CREATE INDEX IF NOT EXISTS idx_task_document_links_document_id ON task_document_links(document_id);
