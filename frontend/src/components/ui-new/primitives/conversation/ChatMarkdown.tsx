import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';
import { useChangesView } from '@/contexts/ChangesViewContext';

interface ChatMarkdownProps {
  content: string;
  maxWidth?: string;
  className?: string;
  workspaceId?: string;
}

export function ChatMarkdown({
  content,
  maxWidth = '800px',
  className,
  workspaceId,
}: ChatMarkdownProps) {
  const { viewFileInChanges, findMatchingDiffPath } = useChangesView();
  const wysiwygClassName = cn('whitespace-pre-wrap break-words', className);

  return (
    <div className="text-sm" style={{ maxWidth }}>
      <WYSIWYGEditor
        value={content}
        disabled
        className={wysiwygClassName}
        taskAttemptId={workspaceId}
        findMatchingDiffPath={findMatchingDiffPath}
        onCodeClick={viewFileInChanges}
      />
    </div>
  );
}
