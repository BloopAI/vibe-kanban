import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import type {
  Session,
  CreateFollowUpAttempt,
  BaseCodingAgent,
} from 'shared/types';

interface CreateSessionParams {
  workspaceId: string;
  prompt: string;
  executor: BaseCodingAgent;
  variant: string | null;
}

/**
 * Hook for creating a new session and sending the first message.
 * Uses TanStack Query mutation for proper cache management.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      prompt,
      executor,
      variant,
    }: CreateSessionParams): Promise<Session> => {
      // Step 1: Create the session (executor will be set by follow-up)
      const session = await sessionsApi.create({
        workspace_id: workspaceId,
      });

      // Step 2: Send the first message as a follow-up (this sets the executor)
      const body: CreateFollowUpAttempt = {
        prompt,
        executor_profile_id: { executor, variant },
        retry_process_id: null,
        force_when_dirty: null,
        perform_git_reset: null,
      };
      await sessionsApi.followUp(session.id, body);

      return session;
    },
    onSuccess: (session) => {
      // Invalidate session queries to refresh the list
      queryClient.invalidateQueries({
        queryKey: ['workspaceSessions', session.workspace_id],
      });
    },
  });
}
