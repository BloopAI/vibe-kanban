import { ChatEntryContainer } from './ChatEntryContainer';
import { ChatMarkdown } from './ChatMarkdown';

interface ChatUserMessageProps {
  content: string;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  taskAttemptId?: string;
}

export function ChatUserMessage({
  content,
  expanded = true,
  onToggle,
  className,
  taskAttemptId,
}: ChatUserMessageProps) {
  return (
    <ChatEntryContainer
      variant="user"
      title="You"
      expanded={expanded}
      onToggle={onToggle}
      className={className}
    >
      <ChatMarkdown content={content} taskAttemptId={taskAttemptId} />
    </ChatEntryContainer>
  );
}
