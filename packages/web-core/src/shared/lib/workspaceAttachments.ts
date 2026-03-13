import type { AttachmentResponse } from 'shared/types';
import type { LocalAttachmentMetadata } from '@vibe/ui/components/WorkspaceContext';

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

export function toLocalAttachmentMetadata(
  attachment: AttachmentResponse
): LocalAttachmentMetadata {
  return {
    path: attachment.file_path,
    proxy_url: `/api/images/${attachment.id}/file`,
    file_name: attachment.original_name,
    size_bytes: Number(attachment.size_bytes),
    format: attachment.mime_type?.split('/')[1] ?? 'bin',
    mime_type: attachment.mime_type ?? 'application/octet-stream',
  };
}
