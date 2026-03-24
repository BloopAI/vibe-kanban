-- Electrify linear_issue_links so the frontend can subscribe to real-time
-- updates (e.g. to show a "GitNexus analysis pending" indicator).
ALTER TABLE linear_issue_links REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'electric_publication_default'
          AND tablename = 'linear_issue_links'
    ) THEN
        PERFORM electric_sync_table('public', 'linear_issue_links');
    END IF;
END $$;
