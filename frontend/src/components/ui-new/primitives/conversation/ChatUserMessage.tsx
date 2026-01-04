import { PencilSimpleIcon } from '@phosphor-icons/react';
import { ChatEntryContainer } from './ChatEntryContainer';
import { ChatMarkdown } from './ChatMarkdown';

interface ChatUserMessageProps {
  content: string;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  workspaceId?: string;
  onEdit?: () => void;
  isGreyed?: boolean;
}

export function ChatUserMessage({
  content,
  expanded = true,
  onToggle,
  className,
  workspaceId,
  onEdit,
  isGreyed,
}: ChatUserMessageProps) {
  return (
    <ChatEntryContainer
      variant="user"
      title="You"
      expanded={expanded}
      onToggle={onToggle}
      className={className}
      isGreyed={isGreyed}
      headerRight={
        onEdit && !isGreyed ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 rounded hover:bg-muted text-low hover:text-normal transition-colors"
            aria-label="Edit message"
          >
            <PencilSimpleIcon className="size-icon-xs" />
          </button>
        ) : undefined
      }
    >
      <ChatMarkdown content={content} workspaceId={workspaceId} />
    </ChatEntryContainer>
  );
}
