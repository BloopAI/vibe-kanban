import { ChatMarkdown } from './ChatMarkdown';

interface ChatAssistantMessageProps {
  content: string;
  workspaceId?: string;
  className?: string;
}

export function ChatAssistantMessage({
  content,
  workspaceId,
  className,
}: ChatAssistantMessageProps) {
  return (
    <div className={className}>
      <ChatMarkdown content={content} workspaceId={workspaceId} />
    </div>
  );
}
