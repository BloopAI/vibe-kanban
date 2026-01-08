
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { documentsApi } from '@/lib/api';

interface UploadProgress {
    total: number;
    uploaded: number;
    errors: string[];
}

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

export function useFolderUpload(teamId: string, currentFolderId: string | null) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState<UploadProgress | null>(null);

    const uploadFolder = useCallback(async (files: FileList) => {
        setIsUploading(true);
        setProgress({ total: files.length, uploaded: 0, errors: [] });

        let uploadedCount = 0;
        const errors: string[] = [];
        const BUCKET_NAME = 'ikanban-bucket';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // webkitRelativePath contains "folder/subfolder/file.txt"
            // We store it as "team_id/{folder_structure}"
            const path = `${teamId}/${file.webkitRelativePath || file.name}`;

            try {
                // 1. Upload to Supabase storage
                const { error: uploadError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(path, file, {
                        cacheControl: '3600',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                // 2. Get the public URL for the uploaded file
                const { data: urlData } = supabase.storage
                    .from(BUCKET_NAME)
                    .getPublicUrl(path);

                const publicUrl = urlData?.publicUrl;

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
                    file_path: publicUrl || path,
                    file_size: file.size,
                    mime_type: mimeType,
                });

                uploadedCount++;
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                console.error(`Failed to upload ${file.name}:`, err);
                errors.push(`${file.name}: ${errorMessage}`);
            }

            setProgress(prev => prev ? { ...prev, uploaded: uploadedCount, errors } : null);
        }

        setIsUploading(false);
        return { uploaded: uploadedCount, errors };
    }, [teamId, currentFolderId]);

    return { uploadFolder, isUploading, progress };
}
