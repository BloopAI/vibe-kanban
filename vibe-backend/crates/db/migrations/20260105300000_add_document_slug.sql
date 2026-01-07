-- Add slug column to documents table for human-readable URLs
ALTER TABLE documents ADD COLUMN slug TEXT;

-- Create index for fast slug lookups within a team
CREATE INDEX idx_documents_team_slug ON documents(team_id, slug);

-- Backfill existing documents with slugs generated from titles
-- Slug format: lowercase, spaces to hyphens, remove special chars
UPDATE documents SET slug = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    title, ' ', '-'), '/', '-'), ':', ''), '.', ''), ',', ''), '''', ''));
