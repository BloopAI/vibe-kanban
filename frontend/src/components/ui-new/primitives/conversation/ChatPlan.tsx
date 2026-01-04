import { ChatMarkdown } from './ChatMarkdown';
import { ChatEntryContainer } from './ChatEntryContainer';
import { ToolStatus } from 'shared/types';

interface ChatPlanProps {
  title: string;
  content: string;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  workspaceId?: string;
  status: ToolStatus;
}

export function ChatPlan({
  title,
  content,
  expanded = false,
  onToggle,
  className,
  workspaceId,
  status,
}: ChatPlanProps) {
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
