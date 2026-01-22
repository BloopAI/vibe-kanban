import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';

export function useRalphStoryCommits(taskId: string) {
  return useQuery({
    queryKey: ['ralph-story-commits', taskId],
    queryFn: () => tasksApi.getRalphStoryCommits(taskId),
    // Commits don't change often, so we can cache for longer
    staleTime: 30000,
  });
}
