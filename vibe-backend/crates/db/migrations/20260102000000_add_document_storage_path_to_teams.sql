-- Add document_storage_path column to teams table
-- This allows teams to configure a custom directory path for document storage

ALTER TABLE teams ADD COLUMN document_storage_path TEXT;

-- The path can be:
-- NULL: Use default application storage (dev_assets/documents/{team_id}/)
-- Absolute path: Store documents in the specified directory
