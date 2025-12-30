import { ChatMarkdown } from './ChatMarkdown';

interface ChatAssistantMessageProps {
  content: string;
  taskAttemptId?: string;
}

export function ChatAssistantMessage({
  content,
  taskAttemptId,
}: ChatAssistantMessageProps) {
  return <ChatMarkdown content={content} taskAttemptId={taskAttemptId} />;
}
