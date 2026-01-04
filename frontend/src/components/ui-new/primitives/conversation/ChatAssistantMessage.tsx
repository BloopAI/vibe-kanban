import { ChatMarkdown } from './ChatMarkdown';

interface ChatAssistantMessageProps {
  content: string;
  workspaceId?: string;
}

export function ChatAssistantMessage({
  content,
  workspaceId,
}: ChatAssistantMessageProps) {
  return <ChatMarkdown content={content} workspaceId={workspaceId} />;
}
