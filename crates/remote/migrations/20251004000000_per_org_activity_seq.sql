CREATE TABLE IF NOT EXISTS project_activity_counters (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
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
    ADD CONSTRAINT activity_pkey PRIMARY KEY (project_id, seq);

INSERT INTO project_activity_counters (project_id, last_seq)
SELECT project_id, COALESCE(MAX(seq), 0)
FROM activity
GROUP BY project_id
ON CONFLICT (project_id) DO UPDATE
    SET last_seq = EXCLUDED.last_seq;
