import { Hammer } from 'lucide-react';
import { Loader } from '@/components/ui/loader.tsx';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';
import type { ExecutionProcess, WorktreeDiff } from 'shared/types.ts';
import DisplayConversationEntry from '@/components/tasks/TaskDetails/DisplayConversationEntry.tsx';
import useNormalizedConversation from '@/hooks/useNormalizedConversation';

interface NormalizedConversationViewerProps {
  executionProcess: ExecutionProcess;
  onConversationUpdate?: () => void;
  diff?: WorktreeDiff | null;
  isBackgroundRefreshing?: boolean;
  diffDeletable?: boolean;
}

export function NormalizedConversationViewer({
  executionProcess,
  diffDeletable,
  onConversationUpdate,
}: NormalizedConversationViewerProps) {
  const { loading, error, conversation, displayEntries } =
    useNormalizedConversation({
      executionProcess,
      onConversationUpdate,
    });

  if (loading) {
    return (
      <Loader message="Loading conversation..." size={24} className="py-4" />
    );
  }

  if (error) {
    return <div className="text-xs text-red-600 text-center">{error}</div>;
  }

  if (!conversation || conversation.entries.length === 0) {
    // If the execution process is still running, show loading instead of "no data"
    if (executionProcess.status === 'running') {
      return (
        <div className="text-xs text-muted-foreground italic text-center">
          Waiting for logs...
        </div>
      );
    }

    return (
      <div className="text-xs text-muted-foreground italic text-center">
        No conversation data available
      </div>
    );
  }

  return (
    <div>
      {/* Display prompt if available */}
      {conversation.prompt && (
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <Hammer className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm whitespace-pre-wrap text-foreground">
              <MarkdownRenderer
                content={conversation.prompt}
                className="whitespace-pre-wrap break-words"
              />
            </div>
          </div>
        </div>
      )}

      {/* Display conversation entries */}
      <div className="space-y-2">
        {displayEntries.map((entry, index) => (
          <DisplayConversationEntry
            key={entry.timestamp || index}
            entry={entry}
            index={index}
            diffDeletable={diffDeletable}
          />
        ))}
      </div>
    </div>
  );
}
