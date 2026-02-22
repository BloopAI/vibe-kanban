import { useContext, useMemo, useCallback, type ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import {
  useShape,
  type InsertResult,
  type MutationResult,
} from '@/lib/electric/hooks';
import {
  ISSUE_COMMENTS_SHAPE,
  ISSUE_REACTIONS_SHAPE,
  ISSUE_COMMENT_MUTATION,
  ISSUE_COMMENT_REACTION_MUTATION,
  type IssueComment,
  type IssueCommentReaction,
  type CreateIssueCommentRequest,
  type UpdateIssueCommentRequest,
  type CreateIssueCommentReactionRequest,
} from 'shared/remote-types';
import type { SyncError } from '@/lib/electric/types';

/**
 * IssueContext provides issue-scoped data and mutations.
 *
 * This context is used when viewing issue details. Wrap with
 * `<IssueProvider issueId={...}>` to load comments/reactions for that issue.
 *
 * Entities synced at issue scope:
 * - IssueComments (data + mutations)
 * - IssueCommentReactions (data + mutations)
 *
 * @example
 * // In an issue detail panel
 * <IssueProvider issueId={selectedIssueId}>
 *   <IssueCommentsSection />
 * </IssueProvider>
 *
 * // Inside IssueCommentsSection:
 * const { comments, insertComment, getReactionsForComment } = useIssueContext();
 * // `comments` already contains only comments for this issue
 */
export interface IssueContextValue {
  issueId: string;

  // Normalized data arrays (Electric syncs only this issue's data)
  comments: IssueComment[];
  reactions: IssueCommentReaction[];

  // Loading/error state
  isLoading: boolean;
  error: SyncError | null;
  retry: () => void;

  // Comment mutations
  insertComment: (
    data: CreateIssueCommentRequest
  ) => InsertResult<IssueComment>;
  updateComment: (
    id: string,
    changes: Partial<UpdateIssueCommentRequest>
  ) => MutationResult;
  removeComment: (id: string) => MutationResult;

  // Reaction mutations
  insertReaction: (
    data: CreateIssueCommentReactionRequest
  ) => InsertResult<IssueCommentReaction>;
  removeReaction: (id: string) => MutationResult;

  // Lookup helpers (within this issue's data)
  getComment: (commentId: string) => IssueComment | undefined;
  getReactionsForComment: (commentId: string) => IssueCommentReaction[];
  getReactionCountForComment: (commentId: string) => number;
  hasUserReactedToComment: (
    commentId: string,
    userId: string,
    emoji: string
  ) => boolean;

  // Computed aggregations
  commentsById: Map<string, IssueComment>;
  reactionsByComment: Map<string, IssueCommentReaction[]>;
}

const IssueContext = createHmrContext<IssueContextValue | null>(
  'IssueContext',
  null
);

interface IssueProviderProps {
  issueId: string;
  children: ReactNode;
}

export function IssueProvider({ issueId, children }: IssueProviderProps) {
  const params = useMemo(() => ({ issue_id: issueId }), [issueId]);
  const enabled = Boolean(issueId);

  // Shape subscriptions
  const commentsResult = useShape(ISSUE_COMMENTS_SHAPE, params, {
    enabled,
    mutation: ISSUE_COMMENT_MUTATION,
  });
  const reactionsResult = useShape(ISSUE_REACTIONS_SHAPE, params, {
    enabled,
    mutation: ISSUE_COMMENT_REACTION_MUTATION,
  });

  // Combined loading state
  const isLoading = commentsResult.isLoading || reactionsResult.isLoading;

  // First error found
  const error = commentsResult.error || reactionsResult.error || null;

  // Combined retry
  const retry = useCallback(() => {
    commentsResult.retry();
    reactionsResult.retry();
  }, [commentsResult, reactionsResult]);

  // Computed Maps for O(1) lookup
  const commentsById = useMemo(() => {
    const map = new Map<string, IssueComment>();
    for (const comment of commentsResult.data) {
      map.set(comment.id, comment);
    }
    return map;
  }, [commentsResult.data]);

  const reactionsByComment = useMemo(() => {
    const map = new Map<string, IssueCommentReaction[]>();
    for (const reaction of reactionsResult.data) {
      const existing = map.get(reaction.comment_id) ?? [];
      existing.push(reaction);
      map.set(reaction.comment_id, existing);
    }
    return map;
  }, [reactionsResult.data]);

  // Lookup helpers
  const getComment = useCallback(
    (commentId: string) => commentsById.get(commentId),
    [commentsById]
  );

  const getReactionsForComment = useCallback(
    (commentId: string) => reactionsByComment.get(commentId) ?? [],
    [reactionsByComment]
  );

  const getReactionCountForComment = useCallback(
    (commentId: string) => (reactionsByComment.get(commentId) ?? []).length,
    [reactionsByComment]
  );

  const hasUserReactedToComment = useCallback(
    (commentId: string, userId: string, emoji: string) => {
      const reactions = reactionsByComment.get(commentId) ?? [];
      return reactions.some((r) => r.user_id === userId && r.emoji === emoji);
    },
    [reactionsByComment]
  );

  const value = useMemo<IssueContextValue>(
    () => ({
      issueId,

      // Data
      comments: commentsResult.data,
      reactions: reactionsResult.data,

      // Loading/error
      isLoading,
      error,
      retry,

      // Comment mutations
      insertComment: commentsResult.insert,
      updateComment: commentsResult.update,
      removeComment: commentsResult.remove,

      // Reaction mutations
      insertReaction: reactionsResult.insert,
      removeReaction: reactionsResult.remove,

      // Lookup helpers
      getComment,
      getReactionsForComment,
      getReactionCountForComment,
      hasUserReactedToComment,

      // Computed aggregations
      commentsById,
      reactionsByComment,
    }),
    [
      issueId,
      commentsResult,
      reactionsResult,
      isLoading,
      error,
      retry,
      getComment,
      getReactionsForComment,
      getReactionCountForComment,
      hasUserReactedToComment,
      commentsById,
      reactionsByComment,
    ]
  );

  return (
    <IssueContext.Provider value={value}>{children}</IssueContext.Provider>
  );
}

/**
 * Hook to access issue context.
 * Must be used within an IssueProvider.
 */
export function useIssueContext(): IssueContextValue {
  const context = useContext(IssueContext);
  if (!context) {
    throw new Error('useIssueContext must be used within an IssueProvider');
  }
  return context;
}

/**
 * Hook to optionally access issue context.
 * Returns null if not within an IssueProvider.
 * Useful for components that may or may not be rendered within issue detail views.
 */
export function useIssueContextOptional(): IssueContextValue | null {
  return useContext(IssueContext);
}
