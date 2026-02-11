import { useMemo, useCallback, useState, useRef } from 'react';
import { IssueProvider, useIssueContext } from '@/contexts/remote/IssueContext';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { useCurrentUser } from '@/hooks/auth/useCurrentUser';
import {
  IssueCommentsSection,
  type IssueCommentData,
  type ReactionGroup,
} from '@/components/ui-new/views/IssueCommentsSection';
import type { WYSIWYGEditorRef } from '@/components/ui/wysiwyg';
import { MemberRole } from 'shared/remote-types';

interface IssueCommentsSectionContainerProps {
  issueId: string;
}

/**
 * Container that wraps IssueCommentsSection with IssueProvider.
 * Manages comment data transformation, mutations, and UI state.
 */
export function IssueCommentsSectionContainer({
  issueId,
}: IssueCommentsSectionContainerProps) {
  return (
    <IssueProvider issueId={issueId}>
      <IssueCommentsSectionContent />
    </IssueProvider>
  );
}

function IssueCommentsSectionContent() {
  const { membersWithProfilesById } = useOrgContext();
  const issueContext = useIssueContext();
  const { data: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.user_id ?? '';

  // Check if current user is admin
  const currentUserMember = currentUserId
    ? membersWithProfilesById.get(currentUserId)
    : undefined;
  const isCurrentUserAdmin = currentUserMember?.role === MemberRole.ADMIN;

  // Ref to comment editor for programmatic focus
  const commentEditorRef = useRef<WYSIWYGEditorRef>(null);

  // UI state for comment input
  const [commentInput, setCommentInput] = useState('');

  // UI state for editing
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Transform IssueComment to IssueCommentData
  const commentsData = useMemo<IssueCommentData[]>(() => {
    return issueContext.comments
      .map((comment) => {
        const author = comment.author_id
          ? membersWithProfilesById.get(comment.author_id)
          : undefined;
        const isAuthor =
          comment.author_id !== null && comment.author_id === currentUserId;
        const canModify = isAuthor || isCurrentUserAdmin;
        return {
          id: comment.id,
          authorId: comment.author_id,
          authorName: comment.author_id
            ? author
              ? `${author.first_name ?? ''} ${author.last_name ?? ''}`.trim() ||
                author.email ||
                'Unknown User'
              : 'Unknown User'
            : 'Deleted User',
          message: comment.message,
          createdAt: comment.created_at,
          author: author ?? null,
          canModify,
        };
      })
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }, [
    issueContext.comments,
    membersWithProfilesById,
    currentUserId,
    isCurrentUserAdmin,
  ]);

  // Group reactions by comment, then by emoji
  const reactionsByCommentId = useMemo(() => {
    const result = new Map<string, ReactionGroup[]>();

    for (const comment of commentsData) {
      const commentReactions = issueContext.getReactionsForComment(comment.id);
      const emojiMap = new Map<
        string,
        {
          count: number;
          hasReacted: boolean;
          reactionId: string | undefined;
          userIds: string[];
        }
      >();

      for (const reaction of commentReactions) {
        const existing = emojiMap.get(reaction.emoji);
        const isCurrentUser = reaction.user_id === currentUserId;

        if (existing) {
          existing.count++;
          existing.userIds.push(reaction.user_id);
          if (isCurrentUser) {
            existing.hasReacted = true;
            existing.reactionId = reaction.id;
          }
        } else {
          emojiMap.set(reaction.emoji, {
            count: 1,
            hasReacted: isCurrentUser,
            reactionId: isCurrentUser ? reaction.id : undefined,
            userIds: [reaction.user_id],
          });
        }
      }

      const groups: ReactionGroup[] = Array.from(emojiMap.entries()).map(
        ([emoji, data]) => ({
          emoji,
          count: data.count,
          hasReacted: data.hasReacted,
          reactionId: data.reactionId,
          userNames: data.userIds.map((userId) => {
            const member = membersWithProfilesById.get(userId);
            return member
              ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() ||
                  member.email ||
                  'Unknown User'
              : 'Unknown User';
          }),
        })
      );

      result.set(comment.id, groups);
    }

    return result;
  }, [commentsData, issueContext, currentUserId, membersWithProfilesById]);

  const handleSubmitComment = useCallback(() => {
    if (!commentInput.trim()) return;
    issueContext.insertComment({
      issue_id: issueContext.issueId,
      message: commentInput.trim(),
      parent_id: null,
    });
    setCommentInput('');
  }, [commentInput, issueContext]);

  const handleStartEdit = useCallback(
    (commentId: string) => {
      const comment = commentsData.find((c) => c.id === commentId);
      if (comment) {
        setEditingCommentId(commentId);
        setEditingValue(comment.message);
      }
    },
    [commentsData]
  );

  const handleSaveEdit = useCallback(() => {
    if (!editingCommentId || !editingValue.trim()) return;
    issueContext.updateComment(editingCommentId, {
      message: editingValue.trim(),
    });
    setEditingCommentId(null);
    setEditingValue('');
  }, [editingCommentId, editingValue, issueContext]);

  const handleCancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditingValue('');
  }, []);

  const handleDeleteComment = useCallback(
    (id: string) => {
      issueContext.removeComment(id);
    },
    [issueContext]
  );

  const handleToggleReaction = useCallback(
    (commentId: string, emoji: string) => {
      // Check if user already has this reaction
      const reactions = issueContext.getReactionsForComment(commentId);
      const existingReaction = reactions.find(
        (r) => r.user_id === currentUserId && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove the reaction
        issueContext.removeReaction(existingReaction.id);
      } else {
        // Add the reaction
        issueContext.insertReaction({
          comment_id: commentId,
          emoji,
        });
      }
    },
    [issueContext, currentUserId]
  );

  const handleReply = useCallback((authorName: string, message: string) => {
    // Get first line of the message for the quote
    const firstLine = message.split('\n')[0].trim();
    const truncatedLine =
      firstLine.length > 100 ? `${firstLine.slice(0, 100)}...` : firstLine;
    const quote = `> ${authorName} wrote:\n> ${truncatedLine}`;
    setCommentInput(quote);
    // Focus editor after setting value (setTimeout ensures value is set first)
    setTimeout(() => {
      commentEditorRef.current?.focus();
    }, 0);
  }, []);

  return (
    <IssueCommentsSection
      comments={commentsData}
      commentInput={commentInput}
      onCommentInputChange={setCommentInput}
      onSubmitComment={handleSubmitComment}
      editingCommentId={editingCommentId}
      editingValue={editingValue}
      onEditingValueChange={setEditingValue}
      onStartEdit={handleStartEdit}
      onSaveEdit={handleSaveEdit}
      onCancelEdit={handleCancelEdit}
      onDeleteComment={handleDeleteComment}
      reactionsByCommentId={reactionsByCommentId}
      onToggleReaction={handleToggleReaction}
      onReply={handleReply}
      isLoading={issueContext.isLoading}
      commentEditorRef={commentEditorRef}
    />
  );
}
