-- Blobs: actual file storage metadata (one per unique file)
-- Supports deduplication: same file content (hash) can be shared across attachments
CREATE TABLE blobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    blob_path TEXT NOT NULL UNIQUE,           -- Azure blob path for original
    thumbnail_blob_path TEXT,                 -- Azure blob path for thumbnail (null if not an image)
    original_name TEXT NOT NULL,              -- User-provided filename
    mime_type TEXT,                           -- Content type
    size_bytes BIGINT NOT NULL,
    hash TEXT NOT NULL,                       -- SHA256 for deduplication
    width INT,                                -- Image width in pixels (null for non-images)
    height INT,                               -- Image height in pixels (null for non-images)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blobs_project_id ON blobs(project_id);
CREATE INDEX idx_blobs_hash ON blobs(hash);

-- Attachments: links blobs to issues or comments (junction table)
-- Supports staging (issue_id = NULL, comment_id = NULL) for uploads before creation
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blob_id UUID NOT NULL REFERENCES blobs(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES issue_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,                   -- For cleanup of abandoned staged attachments
    -- Only one target can be set (or neither for staging)
    CONSTRAINT attachments_single_target CHECK (NOT (issue_id IS NOT NULL AND comment_id IS NOT NULL))
);

CREATE INDEX idx_attachments_blob_id ON attachments(blob_id);
CREATE INDEX idx_attachments_issue_id ON attachments(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX idx_attachments_comment_id ON attachments(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_attachments_expires_at ON attachments(expires_at) WHERE expires_at IS NOT NULL;

-- Enable Electric sync for real-time updates
SELECT electric_sync_table('public', 'blobs');
SELECT electric_sync_table('public', 'attachments');
