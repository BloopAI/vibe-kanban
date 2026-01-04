import { ChatMarkdown } from './ChatMarkdown';
import { ChatEntryContainer } from './ChatEntryContainer';
import { ToolStatus } from 'shared/types';

interface ChatApprovalCardProps {
  title: string;
  content: string;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  workspaceId?: string;
  status: ToolStatus;
}

export function ChatApprovalCard({
  title,
  content,
  expanded = false,
  onToggle,
  className,
  workspaceId,
  status,
}: ChatApprovalCardProps) {
  return (
    <ChatEntryContainer
      variant="plan"
      title={title}
      expanded={expanded}
      onToggle={onToggle}
      className={className}
      status={status}
    >
      <ChatMarkdown content={content} workspaceId={workspaceId} />
    </ChatEntryContainer>
  );
}
