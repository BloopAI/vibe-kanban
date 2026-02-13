import {
  XIcon,
  SpinnerIcon,
  ImageIcon,
  DownloadSimpleIcon,
  FileIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAttachmentUrl } from '@/hooks/useAttachmentUrl';
import { formatFileSize } from '@/lib/utils';
import { CollapsibleSectionHeader } from '@/components/ui-new/primitives/CollapsibleSectionHeader';
import { PERSIST_KEYS, type PersistKey } from '@/stores/useUiPreferencesStore';

export interface AttachmentData {
  id: string;
  filename: string;
  blob_id: string;
  size_bytes?: bigint | null;
  mime_type?: string | null;
}

export interface IssueAttachmentsSectionProps {
  attachments: AttachmentData[];
  onDelete: (attachmentId: string) => void;
  onPreview: (attachmentId: string) => void;
  onDownload: (attachmentId: string) => void;
}

function AttachmentThumbnail({
  attachment,
  onDelete,
  onPreview,
  onDownload,
}: {
  attachment: AttachmentData;
  onDelete: (attachmentId: string) => void;
  onPreview: (attachmentId: string) => void;
  onDownload: (attachmentId: string) => void;
}) {
  const { t } = useTranslation('common');
  const { url: thumbnailUrl, loading } = useAttachmentUrl(
    attachment.id,
    'thumbnail'
  );

  const isImage = attachment.mime_type?.startsWith('image/');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPreview(attachment.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPreview(attachment.id);
        }
      }}
      className="bg-secondary rounded border border-border hover:border-brand transition-colors cursor-pointer relative group flex flex-col overflow-hidden"
    >
      <div className="aspect-square flex items-center justify-center overflow-hidden bg-secondary">
        {loading ? (
          <SpinnerIcon className="size-icon-sm text-low animate-spin" />
        ) : thumbnailUrl && isImage ? (
          <img
            src={thumbnailUrl}
            alt={attachment.filename}
            className="w-full h-full object-cover"
          />
        ) : isImage ? (
          <ImageIcon className="size-icon-lg text-low" />
        ) : (
          <FileIcon className="size-icon-lg text-low" />
        )}
      </div>

      <div className="px-1 py-0.5">
        <p className="text-xs text-normal truncate" title={attachment.filename}>
          {attachment.filename}
        </p>
        {attachment.size_bytes != null && (
          <p className="text-xs text-low">
            {formatFileSize(
              typeof attachment.size_bytes === 'bigint'
                ? attachment.size_bytes
                : BigInt(attachment.size_bytes)
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDownload(attachment.id);
        }}
        className="absolute top-0.5 left-0.5 p-0.5 rounded bg-primary/80 text-low hover:text-normal opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={t('kanban.downloadAttachmentAria', {
          filename: attachment.filename,
        })}
      >
        <DownloadSimpleIcon className="size-icon-xs" weight="bold" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(attachment.id);
        }}
        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-primary/80 text-low hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={t('kanban.deleteAttachmentAria', {
          filename: attachment.filename,
        })}
      >
        <XIcon className="size-icon-xs" weight="bold" />
      </button>
    </div>
  );
}

export function IssueAttachmentsSection({
  attachments,
  onDelete,
  onPreview,
  onDownload,
}: IssueAttachmentsSectionProps) {
  const { t } = useTranslation('common');

  if (attachments.length === 0) {
    return null;
  }

  return (
    <CollapsibleSectionHeader
      title={t('kanban.attachmentsTitle', { count: attachments.length })}
      persistKey={PERSIST_KEYS.kanbanIssueAttachments as PersistKey}
      defaultExpanded={true}
    >
      <div className="grid grid-cols-3 gap-2 p-base border-t">
        {attachments.map((attachment) => (
          <AttachmentThumbnail
            key={attachment.id}
            attachment={attachment}
            onDelete={onDelete}
            onPreview={onPreview}
            onDownload={onDownload}
          />
        ))}
      </div>
    </CollapsibleSectionHeader>
  );
}
