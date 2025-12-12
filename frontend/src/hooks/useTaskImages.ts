import { useQuery } from '@tanstack/react-query';
import { imagesApi } from '@/lib/api';
import type { ImageResponse } from 'shared/types';

export const taskImagesKeys = {
  byTask: (taskId: string | undefined) => ['taskImages', taskId] as const,
};

export function useTaskImages(taskId?: string) {
  return useQuery<ImageResponse[]>({
    queryKey: taskImagesKeys.byTask(taskId),
    queryFn: () => imagesApi.getTaskImages(taskId!),
    enabled: !!taskId,
  });
}
