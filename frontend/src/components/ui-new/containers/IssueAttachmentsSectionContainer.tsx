import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { deleteAttachment, fetchAttachmentSasUrl } from '@/lib/remoteApi';
import { ImagePreviewDialog } from '@/components/dialogs/wysiwyg/ImagePreviewDialog';
import {
  IssueAttachmentsSection,
  type AttachmentData,
} from '@/components/ui-new/views/IssueAttachmentsSection';

interface IssueAttachmentsSectionContainerProps {
  issueId: string;
}

export function IssueAttachmentsSectionContainer({
  issueId,
}: IssueAttachmentsSectionContainerProps) {
  const { t } = useTranslation('common');
  const { getAttachmentsForIssue, getBlobForAttachment } = useProjectContext();

  const attachments: AttachmentData[] = useMemo(() => {
    const rawAttachments = getAttachmentsForIssue(issueId);
    return rawAttachments.map((attachment) => {
      const blob = getBlobForAttachment(attachment);
      return {
        id: attachment.id,
        filename: blob?.original_name ?? t('kanban.unknownFile'),
        blob_id: attachment.blob_id,
        size_bytes: blob?.size_bytes,
        mime_type: blob?.mime_type,
      };
    });
  }, [issueId, getAttachmentsForIssue, getBlobForAttachment, t]);

  const openAttachmentInNewTab = useCallback(async (attachmentId: string) => {
    const sasUrl = await fetchAttachmentSasUrl(attachmentId, 'file');
    window.open(sasUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const downloadAttachment = useCallback(async (attachment: AttachmentData) => {
    const sasUrl = await fetchAttachmentSasUrl(attachment.id, 'file');
    const response = await fetch(sasUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error('Failed to download attachment file');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachment.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const handleDelete = useCallback((attachmentId: string) => {
    deleteAttachment(attachmentId).catch((err) => {
      console.error('Failed to delete attachment:', err);
    });
  }, []);

  const handlePreview = useCallback(
    (attachmentId: string) => {
      const attachment = attachments.find((a) => a.id === attachmentId);
      if (!attachment) return;

      const isImage = attachment.mime_type?.startsWith('image/');
      if (!isImage) {
        openAttachmentInNewTab(attachmentId).catch((err) => {
          console.error('Failed to open attachment preview:', err);
        });
        return;
      }

      fetchAttachmentSasUrl(attachmentId, 'file')
        .then((sasUrl) => {
          ImagePreviewDialog.show({
            imageUrl: sasUrl,
            altText: attachment.filename,
            fileName: attachment.filename,
            format: attachment.mime_type?.split('/')[1],
            sizeBytes: attachment.size_bytes
              ? typeof attachment.size_bytes === 'bigint'
                ? attachment.size_bytes
                : BigInt(attachment.size_bytes)
              : null,
          });
        })
        .catch((err) => {
          console.error('Failed to load attachment preview:', err);
        });
    },
    [attachments, openAttachmentInNewTab]
  );

  const handleDownload = useCallback(
    (attachmentId: string) => {
      const attachment = attachments.find((a) => a.id === attachmentId);
      if (!attachment) return;

      downloadAttachment(attachment).catch((err) => {
        console.error('Failed to download attachment:', err);
      });
    },
    [attachments, downloadAttachment]
  );

  return (
    <IssueAttachmentsSection
      attachments={attachments}
      onDelete={handleDelete}
      onPreview={handlePreview}
      onDownload={handleDownload}
    />
  );
}
