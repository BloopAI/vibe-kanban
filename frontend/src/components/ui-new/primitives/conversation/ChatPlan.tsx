import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../PrimaryButton';
import { ChatMarkdown } from './ChatMarkdown';

interface ChatPlanProps {
  title: string;
  content: string;
  expanded?: boolean;
  onToggle?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  showActions?: boolean;
  className?: string;
  taskAttemptId?: string;
}

export function ChatPlan({
  title,
  content,
  expanded = false,
  onToggle,
  onApprove,
  onReject,
  showActions = false,
  className,
  taskAttemptId,
}: ChatPlanProps) {
  return (
    <div className={cn('border rounded-sm w-full', className)}>
      {/* Header */}
      <div
        className={cn(
          'flex items-center bg-panel px-double py-base rounded-t-sm',
          onToggle && 'cursor-pointer'
        )}
        onClick={onToggle}
      >
        <span className="flex-1 text-sm text-normal truncate">{title}</span>
        {onToggle && (
          <CaretDown
            className={cn(
              'size-icon-xs shrink-0 text-low transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div className="bg-panel px-double py-double">
          <ChatMarkdown
            content={content}
            maxWidth="600px"
            taskAttemptId={taskAttemptId}
          />
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-base bg-panel px-double py-base border-t">
          <span className="flex-1 text-sm text-low">
            Would you like to approve this plan?
          </span>
          <div className="flex items-center gap-base">
            {onReject && (
              <PrimaryButton variant="secondary" onClick={onReject}>
                Reject
              </PrimaryButton>
            )}
            {onApprove && (
              <PrimaryButton onClick={onApprove}>Accept</PrimaryButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
