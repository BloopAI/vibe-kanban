
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { documentsApi } from '@/lib/api';

interface UploadProgress {
    total: number;
    uploaded: number;
    errors: string[];
}

export function useFolderUpload(teamId: string, currentFolderId: string | null) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState<UploadProgress | null>(null);

    const uploadFolder = useCallback(async (files: FileList) => {
        setIsUploading(true);
        setProgress({ total: files.length, uploaded: 0, errors: [] });

        let uploadedCount = 0;
        const errors: string[] = [];
        const BUCKET_NAME = 'ikanban-bucket'; // TODO: Move to config if needed

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // webkitRelativePath contains "folder/subfolder/file.txt"
            // We want to store it as "team_id/documents/folder/subfolder/file.txt"
            // OR better: "team_id/{folder_structure}"

            // Note: webkitRelativePath includes the root folder name selected.
            const path = `${teamId}/${file.webkitRelativePath}`;

            try {
                const { error } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(path, file, {
                        cacheControl: '3600',
                        upsert: true
                    });

                if (error) throw error;

                // Optional: Register in Backend Database so it appears in the list
                // We might need a sidebar scanner or backend hook for this.
                // For now, focusing on storage upload as per "Option A".

                uploadedCount++;
            } catch (err: any) {
                console.error(`Failed to upload ${file.name}:`, err);
                errors.push(`${file.name}: ${err.message}`);
            }

            setProgress(prev => prev ? { ...prev, uploaded: uploadedCount, errors } : null);
        }

        setIsUploading(false);
        return { uploaded: uploadedCount, errors };
    }, [teamId]);

    return { uploadFolder, isUploading, progress };
}
