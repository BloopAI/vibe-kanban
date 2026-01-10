/**
 * Setup Supabase Storage Bucket Policies for iKanban
 *
 * This script configures the necessary RLS policies on the storage.objects table
 * to allow the backend service role to upload, read, and delete files.
 *
 * Usage:
 *   cd vibe-backend/schema
 *   npx tsx setup-supabase-storage-policies.ts
 *
 * Prerequisites:
 *   - DATABASE_URL env var must be set (Supabase connection string)
 *   - The ikanban-bucket must already exist in Supabase Storage
 *
 * Related: IKA-27 Supabase Storage Integration
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  console.error('Make sure you have a .env file in vibe-backend/ with DATABASE_URL');
  process.exit(1);
}

const BUCKET_NAME = 'ikanban-bucket';

async function setupStoragePolicies() {
  const client = new Client({ connectionString });

  console.log('Setting up Supabase Storage policies for bucket:', BUCKET_NAME);
  console.log('='.repeat(60));

  try {
    await client.connect();

    // Step 1: Verify bucket exists
    console.log('\n[1/5] Checking if bucket exists...');
    const bucketResult = await client.query(
      `SELECT id, name, public, file_size_limit, allowed_mime_types
       FROM storage.buckets
       WHERE name = $1`,
      [BUCKET_NAME]
    );

    if (bucketResult.rows.length === 0) {
      console.log(`  Bucket "${BUCKET_NAME}" not found. Creating it...`);
      await client.query(
        `INSERT INTO storage.buckets (id, name, public, file_size_limit)
         VALUES ($1, $2, false, 52428800)
         ON CONFLICT (id) DO NOTHING`,
        [BUCKET_NAME, BUCKET_NAME]
      );
      console.log(`  Created bucket "${BUCKET_NAME}" (private, 50MB limit)`);
    } else {
      const bucket = bucketResult.rows[0];
      console.log(`  Bucket "${BUCKET_NAME}" exists:`, {
        public: bucket.public,
        fileSizeLimit: bucket.file_size_limit,
      });
    }

    // Step 2: Drop existing policies to avoid conflicts
    console.log('\n[2/5] Cleaning up existing policies...');

    const existingPoliciesResult = await client.query(
      `SELECT policyname
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname LIKE '%ikanban%'`
    );

    for (const policy of existingPoliciesResult.rows) {
      console.log(`  Dropping policy: ${policy.policyname}`);
      await client.query(`DROP POLICY IF EXISTS "${policy.policyname}" ON storage.objects`);
    }

    // Step 3: Create INSERT policy (for uploads)
    console.log('\n[3/5] Creating INSERT policy (for uploads)...');
    await client.query(`
      CREATE POLICY "ikanban_service_role_insert"
      ON storage.objects
      FOR INSERT
      TO service_role
      WITH CHECK (bucket_id = '${BUCKET_NAME}')
    `);
    console.log('  Created: ikanban_service_role_insert');

    // Step 4: Create SELECT policy (for downloads/signed URLs)
    console.log('\n[4/5] Creating SELECT policy (for downloads)...');
    await client.query(`
      CREATE POLICY "ikanban_service_role_select"
      ON storage.objects
      FOR SELECT
      TO service_role
      USING (bucket_id = '${BUCKET_NAME}')
    `);
    console.log('  Created: ikanban_service_role_select');

    // Step 5: Create DELETE policy (for file removal)
    console.log('\n[5/5] Creating DELETE policy (for file removal)...');
    await client.query(`
      CREATE POLICY "ikanban_service_role_delete"
      ON storage.objects
      FOR DELETE
      TO service_role
      USING (bucket_id = '${BUCKET_NAME}')
    `);
    console.log('  Created: ikanban_service_role_delete');

    // Verify policies were created
    console.log('\n' + '='.repeat(60));
    console.log('Verifying policies...');
    const policiesResult = await client.query(
      `SELECT policyname, permissive, roles, cmd, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname LIKE '%ikanban%'`
    );

    console.log(`\nCreated ${policiesResult.rows.length} policies:`);
    for (const p of policiesResult.rows) {
      console.log(`  - ${p.policyname} (${p.cmd}) -> roles: ${p.roles}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS! Supabase Storage policies configured.');
    console.log('\nNext steps:');
    console.log('1. Verify SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET are set in Railway');
    console.log('2. Redeploy the backend service');
    console.log('3. Test file upload via the Documents feature');

  } catch (error: any) {
    console.error('\nERROR:', error.message);

    if (error.message.includes('permission denied')) {
      console.error('\nThis error usually means:');
      console.error('- The DATABASE_URL does not have admin/service_role privileges');
      console.error('- You need to use the "postgres" role connection string from Supabase');
    }

    if (error.message.includes('already exists')) {
      console.error('\nPolicy already exists. This is usually fine - the policies are in place.');
    }

    process.exit(1);
  } finally {
    await client.end();
  }
}

setupStoragePolicies();
