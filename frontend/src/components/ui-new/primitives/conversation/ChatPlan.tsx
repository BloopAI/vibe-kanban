import { useApprovalFeedbackOptional } from '@/contexts/ApprovalFeedbackContext';
import { PrimaryButton } from '../PrimaryButton';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatEntryContainer } from './ChatEntryContainer';
import { ToolStatus } from 'shared/types';

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
  workspaceId?: string;
  status: ToolStatus;
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
  workspaceId,
  status,
}: ChatPlanProps) {
  const feedbackContext = useApprovalFeedbackOptional();
  const isInFeedbackMode = feedbackContext?.activeApproval !== null;

  const actions = showActions ? (
    <>
      <span className="flex-1 text-sm text-high">
        {isTimedOut
          ? 'Approval has timed out'
          : 'Would you like to approve this plan?'}
      </span>
      {!isTimedOut && (
        <div className="flex items-center gap-base">
          {onEdit && (
            <PrimaryButton
              actionIcon={isInFeedbackMode ? 'spinner' : undefined}
              variant="secondary"
              onClick={onEdit}
              value={
                isInFeedbackMode ? 'Requesting Changes' : 'Request Changes'
              }
              disabled={isInFeedbackMode}
            />
          )}
          {onApprove && !isInFeedbackMode && (
            <PrimaryButton onClick={onApprove} value="Approve" />
          )}
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
      status={status}
    >
      <ChatMarkdown content={content} workspaceId={workspaceId} />
    </ChatEntryContainer>
  );
}
