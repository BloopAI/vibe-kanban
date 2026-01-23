import { SplitSide } from '@git-diff-view/react';
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { genId } from '@/utils/id';
import {
  useReviewConversations,
  useUnresolvedConversations,
  useCreateConversation,
  useAddMessage,
  useResolveConversation,
  useUnresolveConversation,
  useDeleteConversation,
  useDeleteMessage,
} from '@/hooks/useReviewConversations';
import type { ConversationWithMessages, DiffSide } from 'shared/types';

export interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  side: SplitSide;
  text: string;
  codeLine?: string;
}

export interface ReviewDraft {
  filePath: string;
  side: SplitSide;
  lineNumber: number;
  text: string;
  codeLine?: string;
}

/** Convert git-diff-view SplitSide to our DiffSide type */
function splitSideToDiffSide(side: SplitSide): DiffSide {
  return side === SplitSide.old ? 'old' : 'new';
}

/** Convert DiffSide to git-diff-view SplitSide */
function diffSideToSplitSide(side: string): SplitSide {
  return side === 'old' ? SplitSide.old : SplitSide.new;
}

interface ReviewContextType {
  // Legacy local comments (for backwards compatibility)
  comments: ReviewComment[];
  drafts: Record<string, ReviewDraft>;
  addComment: (comment: Omit<ReviewComment, 'id'>) => void;
  updateComment: (id: string, text: string) => void;
  deleteComment: (id: string) => void;
  clearComments: () => void;
  setDraft: (key: string, draft: ReviewDraft | null) => void;
  generateReviewMarkdown: () => string;

  // New threaded conversations (persisted)
  conversations: ConversationWithMessages[];
  unresolvedConversations: ConversationWithMessages[];
  isLoadingConversations: boolean;
  hasUnresolvedConversations: boolean;
  unresolvedCount: number;

  // Conversation actions
  createConversation: (params: {
    filePath: string;
    lineNumber: number;
    side: SplitSide;
    codeLine?: string;
    initialMessage: string;
  }) => Promise<ConversationWithMessages>;
  addMessageToConversation: (
    conversationId: string,
    content: string
  ) => Promise<ConversationWithMessages>;
  resolveConversation: (
    conversationId: string,
    summary: string
  ) => Promise<ConversationWithMessages>;
  unresolveConversation: (
    conversationId: string
  ) => Promise<ConversationWithMessages>;
  deleteConversation: (conversationId: string) => Promise<void>;
  deleteMessageFromConversation: (
    conversationId: string,
    messageId: string
  ) => Promise<ConversationWithMessages | null>;

  // Get conversations for a specific file
  getConversationsForFile: (filePath: string) => ConversationWithMessages[];

  // Generate markdown including resolved conversation summaries
  generateFullReviewMarkdown: () => string;
}

const ReviewContext = createContext<ReviewContextType | null>(null);

export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error('useReview must be used within a ReviewProvider');
  }
  return context;
}

/**
 * Optional version of useReview that returns null if not inside a ReviewProvider.
 * Useful for components that may or may not be inside a review context.
 */
export function useReviewOptional() {
  return useContext(ReviewContext);
}

export function ReviewProvider({
  children,
  attemptId,
}: {
  children: ReactNode;
  attemptId?: string;
}) {
  // Legacy local comments state
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});

  // Fetch conversations from backend
  const { data: conversations = [], isLoading: isLoadingAll } =
    useReviewConversations(attemptId);

  const { data: unresolvedConversations = [], isLoading: isLoadingUnresolved } =
    useUnresolvedConversations(attemptId);

  // Mutations
  const createConversationMutation = useCreateConversation();
  const addMessageMutation = useAddMessage();
  const resolveConversationMutation = useResolveConversation();
  const unresolveConversationMutation = useUnresolveConversation();
  const deleteConversationMutation = useDeleteConversation();
  const deleteMessageMutation = useDeleteMessage();

  const isLoadingConversations = isLoadingAll || isLoadingUnresolved;
  const hasUnresolvedConversations = unresolvedConversations.length > 0;
  const unresolvedCount = unresolvedConversations.length;

  useEffect(() => {
    return () => clearComments();
  }, [attemptId]);

  // Legacy comment functions
  const addComment = (comment: Omit<ReviewComment, 'id'>) => {
    const newComment: ReviewComment = {
      ...comment,
      id: genId(),
    };
    setComments((prev) => [...prev, newComment]);
  };

  const updateComment = (id: string, text: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === id ? { ...comment, text } : comment
      )
    );
  };

  const deleteComment = (id: string) => {
    setComments((prev) => prev.filter((comment) => comment.id !== id));
  };

  const clearComments = () => {
    setComments([]);
    setDrafts({});
  };

  const setDraft = (key: string, draft: ReviewDraft | null) => {
    setDrafts((prev) => {
      if (draft === null) {
        const newDrafts = { ...prev };
        delete newDrafts[key];
        return newDrafts;
      }
      return { ...prev, [key]: draft };
    });
  };

  // New conversation functions
  const createConversation = useCallback(
    async (params: {
      filePath: string;
      lineNumber: number;
      side: SplitSide;
      codeLine?: string;
      initialMessage: string;
    }) => {
      if (!attemptId) {
        throw new Error('attemptId is required to create a conversation');
      }
      return createConversationMutation.mutateAsync({
        attemptId,
        filePath: params.filePath,
        lineNumber: params.lineNumber,
        side: splitSideToDiffSide(params.side),
        codeLine: params.codeLine,
        initialMessage: params.initialMessage,
      });
    },
    [attemptId, createConversationMutation]
  );

  const addMessageToConversation = useCallback(
    async (conversationId: string, content: string) => {
      if (!attemptId) {
        throw new Error('attemptId is required to add a message');
      }
      return addMessageMutation.mutateAsync({
        attemptId,
        conversationId,
        content,
      });
    },
    [attemptId, addMessageMutation]
  );

  const resolveConv = useCallback(
    async (conversationId: string, summary: string) => {
      if (!attemptId) {
        throw new Error('attemptId is required to resolve a conversation');
      }
      return resolveConversationMutation.mutateAsync({
        attemptId,
        conversationId,
        summary,
      });
    },
    [attemptId, resolveConversationMutation]
  );

  const unresolveConv = useCallback(
    async (conversationId: string) => {
      if (!attemptId) {
        throw new Error('attemptId is required to unresolve a conversation');
      }
      return unresolveConversationMutation.mutateAsync({
        attemptId,
        conversationId,
      });
    },
    [attemptId, unresolveConversationMutation]
  );

  const deleteConv = useCallback(
    async (conversationId: string) => {
      if (!attemptId) {
        throw new Error('attemptId is required to delete a conversation');
      }
      await deleteConversationMutation.mutateAsync({
        attemptId,
        conversationId,
      });
    },
    [attemptId, deleteConversationMutation]
  );

  const deleteMessageFromConv = useCallback(
    async (conversationId: string, messageId: string) => {
      if (!attemptId) {
        throw new Error('attemptId is required to delete a message');
      }
      return deleteMessageMutation.mutateAsync({
        attemptId,
        conversationId,
        messageId,
      });
    },
    [attemptId, deleteMessageMutation]
  );

  const getConversationsForFile = useCallback(
    (filePath: string) => {
      return conversations.filter((c) => c.file_path === filePath);
    },
    [conversations]
  );

  // Legacy markdown generation (for backwards compatibility)
  const generateReviewMarkdown = useCallback(() => {
    if (comments.length === 0) return '';

    const commentsNum = comments.length;

    const header = `## Review Comments (${commentsNum})\n\n`;
    const formatCodeLine = (line?: string) => {
      if (!line) return '';
      if (line.includes('`')) {
        return `\`\`\`\n${line}\n\`\`\``;
      }
      return `\`${line}\``;
    };

    const commentsMd = comments
      .map((comment) => {
        const codeLine = formatCodeLine(comment.codeLine);
        // Format file paths in comment body with backticks
        const bodyWithFormattedPaths = comment.text
          .trim()
          .replace(/([/\\]?[\w.-]+(?:[/\\][\w.-]+)+)/g, '`$1`');
        if (codeLine) {
          return `**${comment.filePath}** (Line ${comment.lineNumber})\n${codeLine}\n\n> ${bodyWithFormattedPaths}\n`;
        }
        return `**${comment.filePath}** (Line ${comment.lineNumber})\n\n> ${bodyWithFormattedPaths}\n`;
      })
      .join('\n');

    return header + commentsMd;
  }, [comments]);

  // New markdown generation including resolved conversation summaries
  const generateFullReviewMarkdown = useCallback(() => {
    const parts: string[] = [];

    // Add legacy comments
    const legacyMd = generateReviewMarkdown();
    if (legacyMd) {
      parts.push(legacyMd);
    }

    // Add resolved conversation summaries
    const resolvedConversations = conversations.filter((c) => c.is_resolved);
    if (resolvedConversations.length > 0) {
      const formatCodeLine = (line?: string | null) => {
        if (!line) return '';
        if (line.includes('`')) {
          return `\`\`\`\n${line}\n\`\`\``;
        }
        return `\`${line}\``;
      };

      const resolvedHeader = `## Resolved Conversations (${resolvedConversations.length})\n\n`;
      const resolvedMd = resolvedConversations
        .map((conv) => {
          const codeLine = formatCodeLine(conv.code_line);
          const summary = conv.resolution_summary || 'No summary provided';
          if (codeLine) {
            return `**${conv.file_path}** (Line ${conv.line_number})\n${codeLine}\n\n> ${summary}\n`;
          }
          return `**${conv.file_path}** (Line ${conv.line_number})\n\n> ${summary}\n`;
        })
        .join('\n');

      parts.push(resolvedHeader + resolvedMd);
    }

    return parts.join('\n\n');
  }, [generateReviewMarkdown, conversations]);

  const value = useMemo(
    () => ({
      // Legacy
      comments,
      drafts,
      addComment,
      updateComment,
      deleteComment,
      clearComments,
      setDraft,
      generateReviewMarkdown,

      // New conversations
      conversations,
      unresolvedConversations,
      isLoadingConversations,
      hasUnresolvedConversations,
      unresolvedCount,
      createConversation,
      addMessageToConversation,
      resolveConversation: resolveConv,
      unresolveConversation: unresolveConv,
      deleteConversation: deleteConv,
      deleteMessageFromConversation: deleteMessageFromConv,
      getConversationsForFile,
      generateFullReviewMarkdown,
    }),
    [
      comments,
      drafts,
      generateReviewMarkdown,
      conversations,
      unresolvedConversations,
      isLoadingConversations,
      hasUnresolvedConversations,
      unresolvedCount,
      createConversation,
      addMessageToConversation,
      resolveConv,
      unresolveConv,
      deleteConv,
      deleteMessageFromConv,
      getConversationsForFile,
      generateFullReviewMarkdown,
    ]
  );

  return (
    <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>
  );
}

// Export utility functions for use in other components
export { splitSideToDiffSide, diffSideToSplitSide };
