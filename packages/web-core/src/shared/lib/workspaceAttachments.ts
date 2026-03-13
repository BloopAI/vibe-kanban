import type { FileResponse } from 'shared/types';
import type { LocalFileMetadata } from '@vibe/ui/components/WorkspaceContext';

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[[\]\\]/g, '\\$&');
}

export function buildWorkspaceAttachmentMarkdown(file: {
  original_name: string;
  file_path: string;
  mime_type?: string | null;
}): string {
  const label = escapeMarkdownLabel(file.original_name);
  if (file.mime_type?.startsWith('image/')) {
    return `![${label}](${file.file_path})`;
  }
  return `[${label}](${file.file_path})`;
}

export function toLocalFileMetadata(file: FileResponse): LocalFileMetadata {
  return {
    path: file.file_path,
    proxy_url: `/api/images/${file.id}/file`,
    file_name: file.original_name,
    size_bytes: Number(file.size_bytes),
    format: file.mime_type?.split('/')[1] ?? 'bin',
    mime_type: file.mime_type ?? 'application/octet-stream',
  };
}
