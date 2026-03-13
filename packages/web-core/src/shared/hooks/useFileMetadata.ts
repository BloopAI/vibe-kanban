import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FileMetadata } from 'shared/types';
import type { LocalFileMetadata } from '@vibe/ui/components/WorkspaceContext';

export function useFileMetadata(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  src: string,
  localFiles?: LocalFileMetadata[]
) {
  const isVibeImage = src.startsWith('.vibe-images/');

  const localFile = useMemo(
    () => localFiles?.find((file) => file.path === src),
    [localFiles, src]
  );

  const localFileMetadata: FileMetadata | null = useMemo(
    () =>
      localFile
        ? {
            exists: true,
            file_name: localFile.file_name,
            path: localFile.path,
            size_bytes: BigInt(localFile.size_bytes),
            format: localFile.format,
            proxy_url: localFile.proxy_url,
          }
        : null,
    [localFile]
  );

  const shouldFetch = isVibeImage && !!workspaceId && !localFile;

  const query = useQuery({
    queryKey: ['fileMetadata', workspaceId, sessionId, src],
    queryFn: async (): Promise<FileMetadata | null> => {
      if (workspaceId && sessionId) {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/images/metadata?path=${encodeURIComponent(src)}&session_id=${sessionId}`
        );
        const data = await res.json();
        return data.data as FileMetadata | null;
      }
      return null;
    },
    enabled: shouldFetch && !!sessionId,
    staleTime: Infinity,
  });

  return {
    data: localFileMetadata ?? query.data,
    isLoading: localFile ? false : query.isLoading,
  };
}
