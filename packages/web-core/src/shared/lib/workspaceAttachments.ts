import type { FileResponse } from 'shared/types';
import type { LocalFileMetadata } from '@vibe/ui/components/WorkspaceContext';

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[[\]\\]/g, '\\$&');
}

export function isImageMimeType(mimeType?: string | null): boolean {
  return mimeType?.startsWith('image/') ?? false;
}

export function buildAttachmentMarkdown(file: {
  name: string;
  src: string;
  mimeType?: string | null;
}): string {
  const label = escapeMarkdownLabel(file.name);
  if (isImageMimeType(file.mimeType)) {
    return `![${label}](${file.src})`;
  }
  return `[${label}](${file.src})`;
}

export function buildWorkspaceAttachmentMarkdown(file: {
  original_name: string;
  file_path: string;
  mime_type?: string | null;
}): string {
  return buildAttachmentMarkdown({
    name: file.original_name,
    src: file.file_path,
    mimeType: file.mime_type,
  });
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
