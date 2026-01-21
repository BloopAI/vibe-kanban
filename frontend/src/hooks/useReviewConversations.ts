import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type {
  ConversationWithMessages,
  CreateConversation,
  CreateMessage,
  DiffSide,
} from 'shared/types';

export const conversationKeys = {
  all: ['reviewConversations'] as const,
  byAttempt: (attemptId: string | undefined) =>
    ['reviewConversations', attemptId] as const,
  unresolved: (attemptId: string | undefined) =>
    ['reviewConversations', attemptId, 'unresolved'] as const,
  single: (attemptId: string | undefined, conversationId: string) =>
    ['reviewConversations', attemptId, conversationId] as const,
};

type UseConversationsOptions = {
  enabled?: boolean;
};

/**
 * Hook for fetching all conversations for a workspace/attempt
 */
export function useReviewConversations(
  attemptId?: string,
  opts?: UseConversationsOptions
) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery<ConversationWithMessages[]>({
    queryKey: conversationKeys.byAttempt(attemptId),
    queryFn: () => attemptsApi.listConversations(attemptId!),
    enabled,
    staleTime: 10_000, // 10s cache
    retry: 2,
  });
}

/**
 * Hook for fetching only unresolved conversations
 */
export function useUnresolvedConversations(
  attemptId?: string,
  opts?: UseConversationsOptions
) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery<ConversationWithMessages[]>({
    queryKey: conversationKeys.unresolved(attemptId),
    queryFn: () => attemptsApi.listUnresolvedConversations(attemptId!),
    enabled,
    staleTime: 5_000, // Shorter cache for unresolved - more dynamic
    retry: 2,
  });
}

/**
 * Hook for fetching a single conversation
 */
export function useReviewConversation(
  attemptId?: string,
  conversationId?: string,
  opts?: UseConversationsOptions
) {
  const enabled = (opts?.enabled ?? true) && !!attemptId && !!conversationId;

  return useQuery<ConversationWithMessages | null>({
    queryKey: conversationKeys.single(attemptId, conversationId!),
    queryFn: async () => {
      const result = await attemptsApi.getConversation(
        attemptId!,
        conversationId!
      );
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    },
    enabled,
    staleTime: 10_000,
    retry: 2,
  });
}

type CreateConversationParams = {
  attemptId: string;
  filePath: string;
  lineNumber: number;
  side: DiffSide;
  codeLine?: string;
  initialMessage: string;
};

/**
 * Hook for creating a new conversation
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attemptId,
      filePath,
      lineNumber,
      side,
      codeLine,
      initialMessage,
    }: CreateConversationParams) => {
      const data: CreateConversation = {
        file_path: filePath,
        line_number: BigInt(lineNumber),
        side,
        code_line: codeLine ?? null,
        initial_message: initialMessage,
      };
      const result = await attemptsApi.createConversation(attemptId, data);
      if (!result.success) {
        throw new Error(
          result.error?.type === 'validation_error'
            ? result.error.message
            : result.message || 'Failed to create conversation'
        );
      }
      return result.data.conversation;
    },
    onSuccess: (_conversation, { attemptId }) => {
      // Invalidate all conversation queries for this attempt
      queryClient.invalidateQueries({
        queryKey: conversationKeys.byAttempt(attemptId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.unresolved(attemptId),
      });
    },
  });
}

type AddMessageParams = {
  attemptId: string;
  conversationId: string;
  content: string;
};

/**
 * Hook for adding a message to a conversation
 */
export function useAddMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attemptId,
      conversationId,
      content,
    }: AddMessageParams) => {
      const data: CreateMessage = { content };
      const result = await attemptsApi.addMessage(
        attemptId,
        conversationId,
        data
      );
      if (!result.success) {
        throw new Error(
          result.error?.type === 'validation_error'
            ? result.error.message
            : result.message || 'Failed to add message'
        );
      }
      return result.data.conversation;
    },
    onSuccess: (conversation, { attemptId, conversationId }) => {
      // Update the cache with the new conversation data
      queryClient.setQueryData(
        conversationKeys.single(attemptId, conversationId),
        conversation
      );
      // Invalidate list queries
      queryClient.invalidateQueries({
        queryKey: conversationKeys.byAttempt(attemptId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.unresolved(attemptId),
      });
    },
  });
}

type ResolveParams = {
  attemptId: string;
  conversationId: string;
  summary: string;
};

/**
 * Hook for resolving a conversation
 */
export function useResolveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ attemptId, conversationId, summary }: ResolveParams) => {
      const result = await attemptsApi.resolveConversation(
        attemptId,
        conversationId,
        { summary }
      );
      if (!result.success) {
        throw new Error(
          result.error?.type === 'already_resolved'
            ? 'Conversation is already resolved'
            : result.message || 'Failed to resolve conversation'
        );
      }
      return result.data.conversation;
    },
    onSuccess: (conversation, { attemptId, conversationId }) => {
      // Update the cache
      queryClient.setQueryData(
        conversationKeys.single(attemptId, conversationId),
        conversation
      );
      // Invalidate list queries
      queryClient.invalidateQueries({
        queryKey: conversationKeys.byAttempt(attemptId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.unresolved(attemptId),
      });
    },
  });
}

type UnresolveParams = {
  attemptId: string;
  conversationId: string;
};

/**
 * Hook for unresolving (re-opening) a conversation
 */
export function useUnresolveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ attemptId, conversationId }: UnresolveParams) => {
      const result = await attemptsApi.unresolveConversation(
        attemptId,
        conversationId
      );
      if (!result.success) {
        throw new Error(result.message || 'Failed to unresolve conversation');
      }
      return result.data.conversation;
    },
    onSuccess: (conversation, { attemptId, conversationId }) => {
      // Update the cache
      queryClient.setQueryData(
        conversationKeys.single(attemptId, conversationId),
        conversation
      );
      // Invalidate list queries
      queryClient.invalidateQueries({
        queryKey: conversationKeys.byAttempt(attemptId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.unresolved(attemptId),
      });
    },
  });
}

type DeleteConversationParams = {
  attemptId: string;
  conversationId: string;
};

/**
 * Hook for deleting a conversation
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ attemptId, conversationId }: DeleteConversationParams) => {
      const result = await attemptsApi.deleteConversation(
        attemptId,
        conversationId
      );
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete conversation');
      }
    },
    onSuccess: (_, { attemptId, conversationId }) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: conversationKeys.single(attemptId, conversationId),
      });
      // Invalidate list queries
      queryClient.invalidateQueries({
        queryKey: conversationKeys.byAttempt(attemptId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.unresolved(attemptId),
      });
    },
  });
}

type DeleteMessageParams = {
  attemptId: string;
  conversationId: string;
  messageId: string;
};

/**
 * Hook for deleting a message from a conversation
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attemptId,
      conversationId,
      messageId,
    }: DeleteMessageParams) => {
      const result = await attemptsApi.deleteMessage(
        attemptId,
        conversationId,
        messageId
      );
      if (!result.success) {
        // If conversation was deleted (no messages left), that's expected
        if (result.error?.type === 'not_found') {
          return null;
        }
        throw new Error(result.message || 'Failed to delete message');
      }
      return result.data;
    },
    onSuccess: (conversation, { attemptId, conversationId }) => {
      if (conversation) {
        // Update the cache with remaining messages
        queryClient.setQueryData(
          conversationKeys.single(attemptId, conversationId),
          conversation
        );
      } else {
        // Conversation was deleted
        queryClient.removeQueries({
          queryKey: conversationKeys.single(attemptId, conversationId),
        });
      }
      // Invalidate list queries
      queryClient.invalidateQueries({
        queryKey: conversationKeys.byAttempt(attemptId),
      });
      queryClient.invalidateQueries({
        queryKey: conversationKeys.unresolved(attemptId),
      });
    },
  });
}

/**
 * Utility hook to check if there are any unresolved conversations
 */
export function useHasUnresolvedConversations(attemptId?: string) {
  const { data: conversations, isLoading } = useUnresolvedConversations(
    attemptId
  );
  return {
    hasUnresolved: (conversations?.length ?? 0) > 0,
    unresolvedCount: conversations?.length ?? 0,
    isLoading,
  };
}
