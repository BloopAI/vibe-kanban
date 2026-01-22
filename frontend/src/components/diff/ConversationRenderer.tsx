import { ConversationThread } from './ConversationThread';
import type { ConversationWithMessages } from 'shared/types';

interface ConversationRendererProps {
  conversation: ConversationWithMessages;
  projectId?: string;
}

export function ConversationRenderer({
  conversation,
  projectId,
}: ConversationRendererProps) {
  return (
    <ConversationThread conversation={conversation} projectId={projectId} />
  );
}
