/**
 * Test Supabase Storage Upload
 *
 * This script tests uploading a file directly to Supabase Storage
 * to verify the bucket policies are working correctly.
 *
 * Usage:
 *   cd vibe-backend/schema
 *   npx tsx test-supabase-upload.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'ikanban-bucket';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

// Test file to upload
const TEST_FILE_PATH = '/Users/rupeshpanwar/Documents/docs/docs-ikanban/integration/IKA-27-supabase-storage-integration.md';
const STORAGE_KEY = `test-uploads/IKA-27-integration-doc-${Date.now()}.md`;

async function testUpload() {
  console.log('Testing Supabase Storage Upload');
  console.log('='.repeat(60));
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`File: ${TEST_FILE_PATH}`);
  console.log(`Storage Key: ${STORAGE_KEY}`);
  console.log('');

  try {
    // Read the file
    const fileContent = fs.readFileSync(TEST_FILE_PATH);
    const fileSize = fileContent.length;
    console.log(`[1/3] Read file: ${fileSize} bytes`);

    // Upload to Supabase Storage
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${STORAGE_KEY}`;
    console.log(`[2/3] Uploading to: ${uploadUrl}`);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'text/markdown',
        'x-upsert': 'true',
      },
      body: fileContent,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`Upload failed with status ${uploadResponse.status}: ${errorText}`);
      process.exit(1);
    }

    const uploadResult = await uploadResponse.json();
    console.log(`[3/3] Upload successful!`);
    console.log('');
    console.log('Upload result:', JSON.stringify(uploadResult, null, 2));

    // Generate a signed URL to verify the file is accessible
    console.log('');
    console.log('Generating signed URL...');

    const signedUrlEndpoint = `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_NAME}/${STORAGE_KEY}`;
    const signedUrlResponse = await fetch(signedUrlEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }), // 1 hour
    });

    if (signedUrlResponse.ok) {
      const signedUrlResult = await signedUrlResponse.json();
      console.log('Signed URL (valid for 1 hour):');
      console.log(`${SUPABASE_URL}/storage/v1${signedUrlResult.signedURL}`);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('SUCCESS! File uploaded to Supabase Storage.');
    console.log('');
    console.log('Verify in Supabase Dashboard:');
    console.log(`  Storage → ${BUCKET_NAME} → test-uploads/`);

  } catch (error: any) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

testUpload();
