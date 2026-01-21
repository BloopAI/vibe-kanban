import { ConversationThread } from './ConversationThread';
import type { ConversationWithMessages } from 'shared/types';

interface ConversationRendererProps {
  conversation: ConversationWithMessages;
  projectId?: string;
}

/**
 * Wrapper component for rendering a conversation in the diff view's extendData.
 * The ConversationThread handles all resolution logic internally.
 */
export function ConversationRenderer({
  conversation,
  projectId,
}: ConversationRendererProps) {
  return (
    <ConversationThread conversation={conversation} projectId={projectId} />
  );
}
