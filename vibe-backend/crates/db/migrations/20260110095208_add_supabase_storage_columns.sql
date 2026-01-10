-- Add Supabase Storage columns to documents table
-- Supports both local filesystem and Supabase Storage backends

-- Add storage columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS storage_key TEXT,
ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
ADD COLUMN IF NOT EXISTS storage_metadata JSONB,
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'local';

-- Add storage_path to document_folders for tracking folder location in bucket
ALTER TABLE document_folders
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Create indexes for storage lookups
CREATE INDEX IF NOT EXISTS idx_documents_storage_key ON documents(storage_key);
CREATE INDEX IF NOT EXISTS idx_documents_storage_provider ON documents(storage_provider);
CREATE INDEX IF NOT EXISTS idx_documents_storage_bucket ON documents(storage_bucket);

-- Add comments for documentation
COMMENT ON COLUMN documents.storage_key IS 'Supabase Storage object key (path in bucket). Format: {team_id}/root/{uuid}_{filename} or {team_id}/folders/{folder_id}/{uuid}_{filename}';
COMMENT ON COLUMN documents.storage_bucket IS 'Supabase Storage bucket name (e.g., ikanban-bucket)';
COMMENT ON COLUMN documents.storage_metadata IS 'Supabase file metadata JSON (etag, version, lastModified, etc.)';
COMMENT ON COLUMN documents.storage_provider IS 'Storage backend: local (filesystem) or supabase (Supabase Storage)';
COMMENT ON COLUMN document_folders.storage_path IS 'Full path in Supabase Storage bucket for this folder';
