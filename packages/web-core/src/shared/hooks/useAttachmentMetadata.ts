import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AttachmentMetadata } from 'shared/types';
import type { LocalAttachmentMetadata } from '@vibe/ui/components/WorkspaceContext';

export function useAttachmentMetadata(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  src: string,
  localAttachments?: LocalAttachmentMetadata[]
) {
  const isVibeImage = src.startsWith('.vibe-images/');

  const localAttachment = useMemo(
    () => localAttachments?.find((attachment) => attachment.path === src),
    [localAttachments, src]
  );

  const localAttachmentMetadata: AttachmentMetadata | null = useMemo(
    () =>
      localAttachment
        ? {
            exists: true,
            file_name: localAttachment.file_name,
            path: localAttachment.path,
            size_bytes: BigInt(localAttachment.size_bytes),
            format: localAttachment.format,
            proxy_url: localAttachment.proxy_url,
          }
        : null,
    [localAttachment]
  );

  const shouldFetch = isVibeImage && !!workspaceId && !localAttachment;

  const query = useQuery({
    queryKey: ['attachmentMetadata', workspaceId, sessionId, src],
    queryFn: async (): Promise<AttachmentMetadata | null> => {
      if (workspaceId && sessionId) {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/images/metadata?path=${encodeURIComponent(src)}&session_id=${sessionId}`
        );
        const data = await res.json();
        return data.data as AttachmentMetadata | null;
      }
      return null;
    },
    enabled: shouldFetch && !!sessionId,
    staleTime: Infinity,
  });

  return {
    data: localAttachmentMetadata ?? query.data,
    isLoading: localAttachment ? false : query.isLoading,
  };
}
