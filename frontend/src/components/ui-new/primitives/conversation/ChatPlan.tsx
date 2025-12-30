import { PrimaryButton } from '../PrimaryButton';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatEntryContainer } from './ChatEntryContainer';

interface ChatPlanProps {
  title: string;
  content: string;
  expanded?: boolean;
  onToggle?: () => void;
  onApprove?: () => void;
  onEdit?: () => void;
  showActions?: boolean;
  isTimedOut?: boolean;
  className?: string;
  taskAttemptId?: string;
}

export function ChatPlan({
  title,
  content,
  expanded = false,
  onToggle,
  onApprove,
  onEdit,
  showActions = false,
  isTimedOut = false,
  className,
  taskAttemptId,
}: ChatPlanProps) {
  const actions = showActions ? (
    <>
      <span className="flex-1 text-sm text-low">
        {isTimedOut
          ? 'Approval has timed out'
          : 'Would you like to approve this plan?'}
      </span>
      {!isTimedOut && (
        <div className="flex items-center gap-base">
          {onEdit && (
            <PrimaryButton
              variant="secondary"
              onClick={onEdit}
              value="Request Changes"
            />
          )}
          {onApprove && <PrimaryButton onClick={onApprove} value="Approve" />}
        </div>
      )}
    </>
  ) : undefined;

  return (
    <ChatEntryContainer
      variant="plan"
      title={title}
      expanded={expanded}
      onToggle={onToggle}
      actions={actions}
      className={className}
    >
      <ChatMarkdown content={content} taskAttemptId={taskAttemptId} />
    </ChatEntryContainer>
  );
}
