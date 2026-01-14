import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';
import { useFileNavigation } from '@/contexts/FileNavigationContext';

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
  const { viewFileInChanges, findMatchingDiffPath } = useFileNavigation();

  return (
    <div className={cn('text-sm', className)} style={{ maxWidth }}>
      <WYSIWYGEditor
        value={content}
        disabled
        className="whitespace-pre-wrap break-words"
        taskAttemptId={workspaceId}
        findMatchingDiffPath={findMatchingDiffPath}
        onCodeClick={viewFileInChanges}
      />
    </div>
  );
}
