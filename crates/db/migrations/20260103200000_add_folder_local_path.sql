-- Add local_path field to document_folders for filesystem sync
-- This allows users to specify a local directory path that will be scanned
-- for markdown documents when the Scan button is clicked
ALTER TABLE document_folders ADD COLUMN local_path TEXT;
