import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalAttachmentMetadata } from '@vibe/ui/components/WorkspaceContext';
import {
  computeFileHash,
  confirmAttachmentUpload,
  deleteAttachment,
  initAttachmentUpload,
  uploadToAzure,
} from '@/shared/lib/remoteApi';
import { buildAttachmentMarkdown } from '@/shared/lib/workspaceAttachments';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingAttachment {
  file: File;
  progress: number;
  status: 'hashing' | 'uploading' | 'confirming';
}

export interface CompletedAttachment {
  id: string;
  filename: string;
  blob_id: string;
}

interface UseAzureAttachmentsOptions {
  projectId: string;
  issueId?: string;
  commentId?: string;
  onMarkdownInsert?: (
    markdown: string,
    options?: { persist?: boolean }
  ) => void;
  onAttachmentSourceReplace?: (
    previousSrc: string,
    nextSrc: string,
    options?: { persist?: boolean }
  ) => boolean;
  onAttachmentSourceRemove?: (
    src: string,
    options?: { persist?: boolean }
  ) => boolean;
  onError?: (message: string) => void;
}

interface UseAzureAttachmentsReturn {
  uploadFiles: (files: File[]) => Promise<void>;
  pendingAttachments: PendingAttachment[];
  completedAttachments: CompletedAttachment[];
  getAttachmentIds: () => string[];
  clearAttachments: () => void;
  isUploading: boolean;
  hasPendingAttachments: boolean;
  uploadError: string | null;
  clearUploadError: () => void;
  localAttachments: LocalAttachmentMetadata[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_BATCH_SIZE = 10;
const PENDING_ATTACHMENT_PREFIX = 'pending-attachment://';

type PendingAttachmentLocal = {
  tempSrc: string;
  objectUrl: string;
  markdown: string;
  file: File;
};

function createPendingAttachmentId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inferFormat(file: File): string {
  const extension = file.name.split('.').pop()?.trim();
  if (extension && extension !== file.name) {
    return extension.toLowerCase();
  }

  return file.type.split('/')[1] ?? 'bin';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAzureAttachments({
  projectId,
  issueId,
  commentId,
  onMarkdownInsert,
  onAttachmentSourceReplace,
  onAttachmentSourceRemove,
  onError,
}: UseAzureAttachmentsOptions): UseAzureAttachmentsReturn {
  const { t } = useTranslation('common');
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [localAttachments, setLocalAttachments] = useState<
    LocalAttachmentMetadata[]
  >([]);
  const [completedAttachments, setCompletedAttachments] = useState<
    CompletedAttachment[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const localObjectsRef = useRef<Map<string, string>>(new Map());
  const pendingCountRef = useRef(0);

  // Avoid stale closures — these may change during async upload
  const issueIdRef = useRef(issueId);
  issueIdRef.current = issueId;
  const commentIdRef = useRef(commentId);
  commentIdRef.current = commentId;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onMarkdownInsertRef = useRef(onMarkdownInsert);
  onMarkdownInsertRef.current = onMarkdownInsert;
  const onAttachmentSourceReplaceRef = useRef(onAttachmentSourceReplace);
  onAttachmentSourceReplaceRef.current = onAttachmentSourceReplace;
  const onAttachmentSourceRemoveRef = useRef(onAttachmentSourceRemove);
  onAttachmentSourceRemoveRef.current = onAttachmentSourceRemove;

  useEffect(() => {
    pendingCountRef.current = pendingAttachments.length;
  }, [pendingAttachments.length]);

  useEffect(() => {
    return () => {
      for (const objectUrl of localObjectsRef.current.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      localObjectsRef.current.clear();
    };
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const reportError = onErrorRef.current ?? console.error;
      const reportErrorMessage = (message: string) => {
        setUploadError(message);
        reportError(message);
      };

      setUploadError(null);

      if (files.length > MAX_BATCH_SIZE) {
        reportErrorMessage(
          t('kanban.maxFilesAtOnce', { count: MAX_BATCH_SIZE })
        );
        return;
      }

      const validFiles: File[] = [];
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          reportErrorMessage(
            t('kanban.fileExceedsLimit', { filename: file.name })
          );
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      setIsUploading(true);

      const pendingLocals: PendingAttachmentLocal[] = validFiles.map((file) => {
        const pendingId = createPendingAttachmentId();
        const tempSrc = `${PENDING_ATTACHMENT_PREFIX}${pendingId}`;
        const objectUrl = URL.createObjectURL(file);
        localObjectsRef.current.set(tempSrc, objectUrl);
        return {
          tempSrc,
          objectUrl,
          markdown: buildAttachmentMarkdown({
            name: file.name,
            src: tempSrc,
            mimeType: file.type || null,
          }),
          file,
        };
      });

      setPendingAttachments((prev) => [
        ...prev,
        ...pendingLocals.map(({ file }) => ({
          file,
          progress: 0,
          status: 'hashing' as const,
        })),
      ]);
      setLocalAttachments((prev) => [
        ...prev,
        ...pendingLocals.map(({ tempSrc, objectUrl, file }) => ({
          path: tempSrc,
          proxy_url: objectUrl,
          file_name: file.name,
          size_bytes: file.size,
          format: inferFormat(file),
          mime_type: file.type || 'application/octet-stream',
          is_pending: true,
          pending_status: 'hashing' as const,
          upload_progress: 0,
        })),
      ]);
      onMarkdownInsertRef.current?.(
        pendingLocals.map((local) => local.markdown).join('\n\n'),
        { persist: false }
      );

      for (const pendingLocal of pendingLocals) {
        const { file, tempSrc } = pendingLocal;

        try {
          const hash = await computeFileHash(file);

          setPendingAttachments((prev) =>
            prev.map((p) =>
              p.file === file ? { ...p, status: 'uploading', progress: 0 } : p
            )
          );
          setLocalAttachments((prev) =>
            prev.map((localFile) =>
              localFile.path === tempSrc
                ? {
                    ...localFile,
                    pending_status: 'uploading',
                    upload_progress: 0,
                  }
                : localFile
            )
          );

          const initResult = await initAttachmentUpload({
            project_id: projectId,
            filename: file.name,
            size_bytes: file.size,
            hash,
          });

          if (!initResult.skip_upload) {
            await uploadToAzure(initResult.upload_url, file, (pct) => {
              setPendingAttachments((prev) =>
                prev.map((p) => (p.file === file ? { ...p, progress: pct } : p))
              );
              setLocalAttachments((prev) =>
                prev.map((localFile) =>
                  localFile.path === tempSrc
                    ? { ...localFile, upload_progress: pct }
                    : localFile
                )
              );
            });
          }

          setPendingAttachments((prev) =>
            prev.map((p) =>
              p.file === file
                ? { ...p, status: 'confirming', progress: 100 }
                : p
            )
          );
          setLocalAttachments((prev) =>
            prev.map((localFile) =>
              localFile.path === tempSrc
                ? {
                    ...localFile,
                    pending_status: 'confirming',
                    upload_progress: 100,
                  }
                : localFile
            )
          );

          const result = await confirmAttachmentUpload({
            project_id: projectId,
            upload_id: initResult.upload_id,
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
            hash,
            issue_id: issueIdRef.current,
            comment_id: commentIdRef.current,
          });

          setCompletedAttachments((prev) => [
            ...prev,
            { id: result.id, filename: file.name, blob_id: result.blob_id },
          ]);

          setPendingAttachments((prev) => prev.filter((p) => p.file !== file));
          const finalSrc = `attachment://${result.id}`;
          setLocalAttachments((prev) =>
            prev.map((localFile) =>
              localFile.path === tempSrc
                ? {
                    ...localFile,
                    path: finalSrc,
                    is_pending: false,
                    pending_status: undefined,
                    upload_progress: undefined,
                  }
                : localFile
            )
          );
          localObjectsRef.current.delete(tempSrc);
          localObjectsRef.current.set(finalSrc, pendingLocal.objectUrl);

          const replaced = onAttachmentSourceReplaceRef.current?.(
            tempSrc,
            finalSrc,
            {
              persist: pendingCountRef.current <= 1,
            }
          );
          if (replaced === false) {
            setCompletedAttachments((prev) =>
              prev.filter((attachment) => attachment.id !== result.id)
            );
            setLocalAttachments((prev) =>
              prev.filter((localFile) => localFile.path !== finalSrc)
            );
            const objectUrl = localObjectsRef.current.get(finalSrc);
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
              localObjectsRef.current.delete(finalSrc);
            }
            deleteAttachment(result.id).catch((error) => {
              console.error('Failed to delete abandoned attachment:', error);
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t('kanban.unknownError');
          reportErrorMessage(
            t('kanban.failedToUploadFile', {
              filename: file.name,
              message,
            })
          );
          setPendingAttachments((prev) => prev.filter((p) => p.file !== file));
          setLocalAttachments((prev) =>
            prev.filter((localFile) => localFile.path !== tempSrc)
          );
          const objectUrl = localObjectsRef.current.get(tempSrc);
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            localObjectsRef.current.delete(tempSrc);
          }
          onAttachmentSourceRemoveRef.current?.(tempSrc, {
            persist: pendingCountRef.current <= 1,
          });
        }
      }

      setIsUploading(false);
    },
    [projectId, t]
  );

  const getAttachmentIds = useCallback(
    () => completedAttachments.map((a) => a.id),
    [completedAttachments]
  );

  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
    setCompletedAttachments([]);
    setLocalAttachments([]);
    for (const objectUrl of localObjectsRef.current.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    localObjectsRef.current.clear();
  }, []);

  const clearUploadError = useCallback(() => {
    setUploadError(null);
  }, []);

  return {
    uploadFiles,
    pendingAttachments,
    completedAttachments,
    getAttachmentIds,
    clearAttachments,
    isUploading,
    hasPendingAttachments: pendingAttachments.length > 0,
    uploadError,
    clearUploadError,
    localAttachments,
  };
}
