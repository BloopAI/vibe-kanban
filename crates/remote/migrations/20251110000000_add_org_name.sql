ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name TEXT;

UPDATE organizations o
SET name = COALESCE(u.first_name, u.username, u.id) || '''s Org'
FROM users u
WHERE o.id = ('org-' || u.id) AND (o.name IS NULL OR o.name = '');

UPDATE organizations
SET name = slug
WHERE (name IS NULL OR name = '');

ALTER TABLE organizations ALTER COLUMN name SET NOT NULL;
