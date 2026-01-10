
import { useState, useCallback } from 'react';
import { documentsApi } from '@/lib/api';

interface UploadProgress {
    total: number;
    uploaded: number;
    errors: string[];
}

// Rate limiting configuration for file uploads
const UPLOAD_CONFIG = {
    batchSize: 5,           // Process files in batches of 5
    batchDelayMs: 500,      // 500ms delay between batches
    maxRetries: 3,          // Max retries per file
    retryDelayMs: 1000,     // Base delay for retry (exponential backoff)
};

/**
 * Sleep for a given number of milliseconds
 */
const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
const getRetryDelay = (attempt: number): number => {
    const exponentialDelay = UPLOAD_CONFIG.retryDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return exponentialDelay + jitter;
};

// Helper to get file extension
function getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
}

// Helper to get MIME type from extension
function getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
        'md': 'text/markdown',
        'markdown': 'text/markdown',
        'txt': 'text/plain',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'htm': 'text/html',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'webp': 'image/webp',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

// Helper to generate title from filename
function getTitleFromFilename(filename: string): string {
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
    return nameWithoutExt
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Upload a single file with retry logic
 */
async function uploadSingleFile(
    file: File,
    teamId: string,
    currentFolderId: string | null
): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= UPLOAD_CONFIG.maxRetries; attempt++) {
        try {
            // 1. Get Signed Upload URL from Backend
            // We don't need bucketName here as backend handles it based on config
            const { url, storage_provider, file_path } = await documentsApi.getUploadUrl(
                teamId,
                file.name,
                currentFolderId
            );

            // 2. Upload to Storage via Signed URL
            const response = await fetch(url, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type || 'application/octet-stream',
                    // Add cache control if supported by signed URL params, usually embedded in URL
                }
            });

            if (!response.ok) {
                // Check for rate limiting
                if (response.status === 429) {
                    throw new Error(`Rate limited: ${response.statusText}`);
                }
                throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
            }

            // 3. Create database record with file metadata
            const extension = getFileExtension(file.name);
            const title = getTitleFromFilename(file.name);
            const mimeType = getMimeType(extension);

            await documentsApi.create(teamId, {
                team_id: teamId,
                folder_id: currentFolderId,
                title,
                content: null,
                file_type: extension || 'unknown',
                icon: null,
                // For Supabase, we store the key in storage_key.
                // We can leave file_path null or descriptive.
                // We use 'any' cast because types might not be generated yet for storage fields
                file_path: null,
                file_size: file.size,
                mime_type: mimeType,
                storage_provider: storage_provider,
                storage_key: file_path, // Key returned from getUploadUrl
            } as any);

            return; // Success - exit retry loop
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (attempt < UPLOAD_CONFIG.maxRetries) {
                const delay = getRetryDelay(attempt);
                console.warn(
                    `[Upload] Retry ${attempt + 1}/${UPLOAD_CONFIG.maxRetries} for ${file.name} in ${Math.round(delay)}ms`
                );
                await sleep(delay);
            }
        }
    }

    // All retries exhausted
    throw lastError || new Error(`Failed to upload ${file.name} after ${UPLOAD_CONFIG.maxRetries} retries`);
}

export function useFolderUpload(teamId: string, currentFolderId: string | null) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState<UploadProgress | null>(null);

    const uploadFolder = useCallback(async (files: FileList) => {
        setIsUploading(true);
        setProgress({ total: files.length, uploaded: 0, errors: [] });

        let uploadedCount = 0;
        const errors: string[] = [];

        // Convert FileList to array for batching
        const fileArray = Array.from(files);

        // Process files in batches
        for (let batchStart = 0; batchStart < fileArray.length; batchStart += UPLOAD_CONFIG.batchSize) {
            const batch = fileArray.slice(batchStart, batchStart + UPLOAD_CONFIG.batchSize);

            // Process batch concurrently
            const batchResults = await Promise.allSettled(
                batch.map(file => uploadSingleFile(file, teamId, currentFolderId))
            );

            // Process results
            batchResults.forEach((result, index) => {
                const file = batch[index];
                if (result.status === 'fulfilled') {
                    uploadedCount++;
                } else {
                    const errorMessage = result.reason instanceof Error
                        ? result.reason.message
                        : 'Unknown error';
                    console.error(`Failed to upload ${file.name}:`, result.reason);
                    errors.push(`${file.name}: ${errorMessage}`);
                }
            });

            setProgress(prev => prev ? { ...prev, uploaded: uploadedCount, errors } : null);

            // Add delay between batches to avoid rate limiting
            // Skip delay after the last batch
            if (batchStart + UPLOAD_CONFIG.batchSize < fileArray.length) {
                await sleep(UPLOAD_CONFIG.batchDelayMs);
            }
        }

        setIsUploading(false);
        return { uploaded: uploadedCount, errors };
    }, [teamId, currentFolderId]);

    return { uploadFolder, isUploading, progress };
}
