-- Migration: Setup Supabase Storage Policies for iKanban
-- Task: IKA-27 - Supabase Storage Integration
--
-- This migration creates RLS policies on storage.objects to allow
-- the service_role to upload, read, and delete files from the ikanban-bucket.
--
-- Run this in Supabase SQL Editor or via psql:
--   psql $DATABASE_URL -f 0001_supabase_storage_policies.sql

-- ============================================
-- Step 1: Ensure bucket exists
-- ============================================
-- Note: The bucket should already exist from Supabase dashboard
-- This is just a safety check
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ikanban-bucket', 'ikanban-bucket', false, 52428800)
ON CONFLICT (id) DO NOTHING;

--> statement-breakpoint

-- ============================================
-- Step 2: Drop existing ikanban policies (cleanup)
-- ============================================
DROP POLICY IF EXISTS "ikanban_service_role_insert" ON storage.objects;
DROP POLICY IF EXISTS "ikanban_service_role_select" ON storage.objects;
DROP POLICY IF EXISTS "ikanban_service_role_delete" ON storage.objects;
DROP POLICY IF EXISTS "ikanban_service_role_update" ON storage.objects;

--> statement-breakpoint

-- ============================================
-- Step 3: Create INSERT policy (for uploads)
-- ============================================
-- Allows service_role to upload files to ikanban-bucket
CREATE POLICY "ikanban_service_role_insert"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'ikanban-bucket');

--> statement-breakpoint

-- ============================================
-- Step 4: Create SELECT policy (for downloads/signed URLs)
-- ============================================
-- Allows service_role to read files from ikanban-bucket
CREATE POLICY "ikanban_service_role_select"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'ikanban-bucket');

--> statement-breakpoint

-- ============================================
-- Step 5: Create UPDATE policy (for metadata updates)
-- ============================================
-- Allows service_role to update file metadata
CREATE POLICY "ikanban_service_role_update"
ON storage.objects
FOR UPDATE
TO service_role
USING (bucket_id = 'ikanban-bucket')
WITH CHECK (bucket_id = 'ikanban-bucket');

--> statement-breakpoint

-- ============================================
-- Step 6: Create DELETE policy (for file removal)
-- ============================================
-- Allows service_role to delete files from ikanban-bucket
CREATE POLICY "ikanban_service_role_delete"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'ikanban-bucket');

--> statement-breakpoint

-- ============================================
-- Verification Query (run separately to check)
-- ============================================
-- SELECT policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'storage'
--   AND tablename = 'objects'
--   AND policyname LIKE '%ikanban%';
