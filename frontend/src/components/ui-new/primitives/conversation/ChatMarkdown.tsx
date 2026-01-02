import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';

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
  return (
    <div className={cn('text-sm text-normal', className)} style={{ maxWidth }}>
      <WYSIWYGEditor
        value={content}
        disabled
        className="whitespace-pre-wrap break-words"
        taskAttemptId={workspaceId}
      />
    </div>
  );
}
