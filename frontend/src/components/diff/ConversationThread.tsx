import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  CaretDownIcon,
  ChatCircleIcon,
  ArrowBendDownRightIcon,
  TrashIcon,
  SpinnerIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import { CommentCard } from '@/components/ui-new/primitives/CommentCard';
import { Button } from '@/components/ui/button';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { useReview } from '@/contexts/ReviewProvider';
import type { ConversationWithMessages, MessageWithAuthor } from 'shared/types';

function toDateString(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString();
}

function MessageItem({
  message,
  isFirst,
  canDelete,
  onDelete,
}: {
  message: MessageWithAuthor;
  isFirst: boolean;
  canDelete: boolean;
  onDelete?: () => void;
}) {
  const { t } = useTranslation('tasks');
  const author = message.author;
  const authorName = author?.username || t('conversation.thread.anonymous');
  const createdAtStr = toDateString(message.created_at);

  return (
    <div className={cn('flex gap-2', !isFirst && 'ml-4 mt-2')}>
      {!isFirst && (
        <ArrowBendDownRightIcon className="size-icon-sm text-low shrink-0 mt-1" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <UserAvatar
            username={author?.username}
            imageUrl={author?.avatar_url}
            className="size-5"
          />
          <span className="font-medium text-sm text-normal">{authorName}</span>
          <span className="text-xs text-low">
            {formatRelativeTime(createdAtStr)}
          </span>
          {canDelete && onDelete && (
            <button
              onClick={onDelete}
              className="ml-auto text-low hover:text-error p-1 rounded"
              title={t('conversation.thread.deleteMessage')}
            >
              <TrashIcon className="size-icon-xs" />
            </button>
          )}
        </div>
        <div className="text-sm text-normal whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
}

function ResolvedConversationView({
  conversation,
  onUnresolve,
}: {
  conversation: ConversationWithMessages;
  onUnresolve?: () => void;
}) {
  const { t } = useTranslation('tasks');
  const [isExpanded, setIsExpanded] = useState(false);
  const resolvedBy = conversation.resolved_by;
  const resolvedAtStr = conversation.resolved_at
    ? toDateString(conversation.resolved_at)
    : null;

  return (
    <CommentCard variant="github" className="opacity-75">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CheckCircleIcon
          className="size-icon-sm text-success shrink-0"
          weight="fill"
        />
        <span className="text-sm font-medium text-success">{t('conversation.thread.resolved')}</span>
        {resolvedBy && (
          <span className="text-xs text-low">
            {t('conversation.thread.resolvedBy', { username: resolvedBy.username })}{' '}
            {resolvedAtStr && formatRelativeTime(resolvedAtStr)}
          </span>
        )}
        <CaretDownIcon
          className={cn(
            'size-icon-xs text-low ml-auto transition-transform',
            !isExpanded && '-rotate-90'
          )}
        />
      </div>

      {conversation.resolution_summary && (
        <div className="mt-2 text-sm text-normal italic border-l-2 border-success/30 pl-2">
          {conversation.resolution_summary}
        </div>
      )}

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs text-low mb-2 uppercase tracking-wide">
            {t('conversation.thread.conversationHistory')}
          </div>
          <div className="space-y-2">
            {conversation.messages.map((msg, idx) => (
              <MessageItem
                key={msg.id}
                message={msg}
                isFirst={idx === 0}
                canDelete={false}
              />
            ))}
          </div>
          {onUnresolve && (
            <div className="mt-3 pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnresolve();
                }}
              >
                {t('conversation.thread.reopenConversation')}
              </Button>
            </div>
          )}
        </div>
      )}
    </CommentCard>
  );
}

function generateDefaultSummary(
  conversation: ConversationWithMessages
): string {
  const messages = conversation.messages || [];
  if (messages.length === 0) return 'Conversation resolved';

  const firstMessage = messages[0].content;
  const truncatedFirst =
    firstMessage.length > 100
      ? firstMessage.slice(0, 100) + '...'
      : firstMessage;

  if (messages.length === 1) {
    return truncatedFirst;
  }

  return `${truncatedFirst} (${messages.length} messages)`;
}

function ActiveConversationView({
  conversation,
  projectId,
}: {
  conversation: ConversationWithMessages;
  projectId?: string;
}) {
  const { t } = useTranslation('tasks');
  const {
    addMessageToConversation,
    deleteMessageFromConversation,
    deleteConversation,
    resolveConversation,
  } = useReview();
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveSummary, setResolveSummary] = useState('');

  const handleAddReply = useCallback(async () => {
    if (!replyText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addMessageToConversation(conversation.id, replyText.trim());
      setReplyText('');
      setIsReplying(false);
    } catch (error) {
      console.error('Failed to add reply:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [replyText, conversation.id, addMessageToConversation, isSubmitting]);

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        await deleteMessageFromConversation(conversation.id, messageId);
      } catch (error) {
        console.error('Failed to delete message:', error);
      }
    },
    [conversation.id, deleteMessageFromConversation]
  );

  const handleDeleteConversation = useCallback(async () => {
    try {
      await deleteConversation(conversation.id);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [conversation.id, deleteConversation]);

  const handleStartResolve = useCallback(() => {
    setResolveSummary(generateDefaultSummary(conversation));
    setIsResolving(true);
  }, [conversation]);

  const handleConfirmResolve = useCallback(async () => {
    if (!resolveSummary.trim()) return;

    setIsSubmitting(true);
    try {
      await resolveConversation(conversation.id, resolveSummary.trim());
      setIsResolving(false);
      setResolveSummary('');
    } catch (error) {
      console.error('Failed to resolve conversation:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [conversation.id, resolveSummary, resolveConversation]);

  const handleCancelResolve = useCallback(() => {
    setIsResolving(false);
    setResolveSummary('');
  }, []);

  const canDeleteMessage = conversation.messages.length > 1;

  return (
    <CommentCard variant="user">
      <div className="space-y-2">
        {conversation.messages.map((msg, idx) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isFirst={idx === 0}
            canDelete={canDeleteMessage}
            onDelete={() => handleDeleteMessage(msg.id)}
          />
        ))}
      </div>

      {isReplying && (
        <div className="mt-3 pt-3 border-t border-brand/30">
          <WYSIWYGEditor
            value={replyText}
            onChange={setReplyText}
            placeholder={t('conversation.thread.replyPlaceholder')}
            className="w-full text-sm min-h-[60px]"
            projectId={projectId}
            onCmdEnter={handleAddReply}
            autoFocus
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="xs"
              onClick={handleAddReply}
              disabled={!replyText.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <SpinnerIcon className="size-icon-sm animate-spin" />
              ) : (
                t('conversation.thread.reply')
              )}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setIsReplying(false);
                setReplyText('');
              }}
            >
              {t('conversation.thread.cancel')}
            </Button>
          </div>
        </div>
      )}

      {isResolving && (
        <div className="mt-3 pt-3 border-t border-success/30">
          <div className="text-xs text-low mb-2 uppercase tracking-wide">
            {t('conversation.thread.resolutionSummary')}
          </div>
          <textarea
            value={resolveSummary}
            onChange={(e) => setResolveSummary(e.target.value)}
            placeholder={t('conversation.thread.resolutionPlaceholder')}
            className="w-full text-sm min-h-[60px] p-2 rounded border border-border bg-surface focus:outline-none focus:ring-1 focus:ring-success resize-none"
            autoFocus
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="xs"
              onClick={handleConfirmResolve}
              disabled={!resolveSummary.trim() || isSubmitting}
              className="bg-success hover:bg-success/90"
            >
              {isSubmitting ? (
                <SpinnerIcon className="size-icon-sm animate-spin mr-1" />
              ) : (
                <CheckCircleIcon className="size-icon-xs mr-1" />
              )}
              {t('conversation.thread.confirmResolve')}
            </Button>
            <Button variant="ghost" size="xs" onClick={handleCancelResolve}>
              {t('conversation.thread.cancel')}
            </Button>
          </div>
        </div>
      )}

      {!isReplying && !isResolving && (
        <div className="mt-3 pt-3 border-t border-brand/30 flex gap-2 flex-wrap">
          <Button variant="ghost" size="xs" onClick={() => setIsReplying(true)}>
            <ChatCircleIcon className="size-icon-xs mr-1" />
            {t('conversation.thread.reply')}
          </Button>
          <Button size="xs" onClick={handleStartResolve}>
            <CheckCircleIcon className="size-icon-xs mr-1" />
            {t('conversation.thread.resolve')}
          </Button>
          {conversation.messages.length === 1 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDeleteConversation}
              className="ml-auto text-error hover:bg-error/10"
            >
              <TrashIcon className="size-icon-xs mr-1" />
              {t('conversation.thread.delete')}
            </Button>
          )}
        </div>
      )}
    </CommentCard>
  );
}

export function ConversationThread({
  conversation,
  projectId,
}: {
  conversation: ConversationWithMessages;
  projectId?: string;
}) {
  const { unresolveConversation } = useReview();

  const handleUnresolve = useCallback(async () => {
    try {
      await unresolveConversation(conversation.id);
    } catch (error) {
      console.error('Failed to unresolve conversation:', error);
    }
  }, [conversation.id, unresolveConversation]);

  if (conversation.is_resolved) {
    return (
      <ResolvedConversationView
        conversation={conversation}
        onUnresolve={handleUnresolve}
      />
    );
  }

  return (
    <ActiveConversationView
      conversation={conversation}
      projectId={projectId}
    />
  );
}
