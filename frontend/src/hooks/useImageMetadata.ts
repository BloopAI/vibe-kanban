import { useQuery } from '@tanstack/react-query';
import type { TaskAttemptImageMetadata } from 'shared/types';

export function useImageMetadata(
  taskAttemptId: string | undefined,
  src: string
) {
  const isVibeImage = src.startsWith('.vibe-images/');
  const enabled = isVibeImage && !!taskAttemptId;

  return useQuery({
    queryKey: ['imageMetadata', taskAttemptId, src],
    queryFn: async () => {
      const res = await fetch(
        `/api/task-attempts/${taskAttemptId}/images/metadata?path=${encodeURIComponent(src)}`
      );
      const data = await res.json();
      return data.data as TaskAttemptImageMetadata | null;
    },
    enabled,
    staleTime: Infinity, // Image metadata doesn't change
  });
}
