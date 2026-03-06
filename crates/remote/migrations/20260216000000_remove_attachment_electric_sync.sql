-- Remove Electric sync for blobs and attachments (shapes are no longer used)
ALTER PUBLICATION electric_publication_default DROP TABLE public.blobs;
REVOKE SELECT ON TABLE public.blobs FROM electric_sync;
ALTER TABLE public.blobs REPLICA IDENTITY DEFAULT;

ALTER PUBLICATION electric_publication_default DROP TABLE public.attachments;
REVOKE SELECT ON TABLE public.attachments FROM electric_sync;
ALTER TABLE public.attachments REPLICA IDENTITY DEFAULT;
