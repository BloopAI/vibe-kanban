CREATE TABLE IF NOT EXISTS organization_activity_counters (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    last_seq BIGINT NOT NULL
);

ALTER TABLE activity
    ALTER COLUMN seq DROP IDENTITY IF EXISTS;

ALTER TABLE activity
    ALTER COLUMN seq DROP DEFAULT;

ALTER TABLE activity
    DROP CONSTRAINT IF EXISTS activity_pkey;

ALTER TABLE activity
    ALTER COLUMN seq SET NOT NULL;

ALTER TABLE activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (organization_id, seq);

INSERT INTO organization_activity_counters (organization_id, last_seq)
SELECT organization_id, COALESCE(MAX(seq), 0)
FROM activity
GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE
    SET last_seq = EXCLUDED.last_seq;
