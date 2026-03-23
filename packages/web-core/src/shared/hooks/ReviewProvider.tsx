import { useState, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { genId } from '@/shared/lib/id';
import {
  ReviewContext,
  type ReviewComment,
  type ReviewDraft,
} from '@/shared/hooks/useReview';

export function ReviewProvider({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId?: string;
}) {
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});

  const addComment = useCallback((comment: Omit<ReviewComment, 'id'>) => {
    const newComment: ReviewComment = {
      ...comment,
      id: genId(),
    };
    setComments((prev) => [...prev, newComment]);
  }, []);

  const updateComment = useCallback((id: string, text: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === id ? { ...comment, text } : comment
      )
    );
  }, []);

  const deleteComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((comment) => comment.id !== id));
  }, []);

  const clearComments = useCallback(() => {
    setComments([]);
    setDrafts({});
  }, []);

  useEffect(() => {
    return () => clearComments();
  }, [workspaceId, clearComments]);

  const setDraft = useCallback((key: string, draft: ReviewDraft | null) => {
    setDrafts((prev) => {
      if (draft === null) {
        const newDrafts = { ...prev };
        delete newDrafts[key];
        return newDrafts;
      }
      return { ...prev, [key]: draft };
    });
  }, []);

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

  const contextValue = useMemo(
    () => ({
      comments,
      drafts,
      addComment,
      updateComment,
      deleteComment,
      clearComments,
      setDraft,
      generateReviewMarkdown,
    }),
    [
      comments,
      drafts,
      addComment,
      updateComment,
      deleteComment,
      clearComments,
      setDraft,
      generateReviewMarkdown,
    ]
  );

  return (
    <ReviewContext.Provider value={contextValue}>
      {children}
    </ReviewContext.Provider>
  );
}
