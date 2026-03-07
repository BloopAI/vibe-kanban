import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ImageMetadata } from 'shared/types';
import type { LocalImageMetadata } from '@vibe/ui/components/WorkspaceContext';

export function useImageMetadata(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  src: string,
  localImages?: LocalImageMetadata[]
) {
  const isVibeImage = src.startsWith('.vibe-images/');

  // Synchronous lookup for local images
  const localImage = useMemo(
    () => localImages?.find((img) => img.path === src),
    [localImages, src]
  );

  // Convert to ImageMetadata format
  const localImageMetadata: ImageMetadata | null = useMemo(
    () =>
      localImage
        ? {
            exists: true,
            file_name: localImage.file_name,
            path: localImage.path,
            size_bytes: BigInt(localImage.size_bytes),
            format: localImage.format,
            proxy_url: localImage.proxy_url,
          }
        : null,
    [localImage]
  );

  // Only fetch from API if: vibe image, has context, and NO local image
  const shouldFetch = isVibeImage && !!workspaceId && !localImage;

  const query = useQuery({
    queryKey: ['imageMetadata', workspaceId, sessionId, src],
    queryFn: async (): Promise<ImageMetadata | null> => {
      if (workspaceId && sessionId) {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/images/metadata?path=${encodeURIComponent(src)}&session_id=${sessionId}`
        );
        const data = await res.json();
        return data.data as ImageMetadata | null;
      }
      return null;
    },
    enabled: shouldFetch && !!sessionId,
    staleTime: Infinity,
  });

  // Return local data if available, otherwise query result
  return {
    data: localImageMetadata ?? query.data,
    isLoading: localImage ? false : query.isLoading,
  };
}
