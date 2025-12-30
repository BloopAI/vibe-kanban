import { PrimaryButton } from '../PrimaryButton';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatEntryContainer } from './ChatEntryContainer';

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
  const actions = showActions ? (
    <>
      <span className="flex-1 text-sm text-low">
        Would you like to approve this plan?
      </span>
      <div className="flex items-center gap-base">
        {onReject && (
          <PrimaryButton
            variant="secondary"
            onClick={onReject}
            value="Reject"
          />
        )}
        {onApprove && <PrimaryButton onClick={onApprove} value="Accept" />}
      </div>
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
