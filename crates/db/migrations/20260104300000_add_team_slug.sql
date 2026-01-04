-- Add slug field to teams for multi-tenant database naming
-- Slug is used for database file naming: team-{slug}.sqlite

-- Add slug column
ALTER TABLE teams ADD COLUMN slug TEXT;

-- Create unique index for slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

-- Generate initial slugs from existing team names
-- Convert name to lowercase, replace spaces with dashes, remove non-alphanumeric except dashes
UPDATE teams
SET slug = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '_', '-'), '.', '-'))
WHERE slug IS NULL;
