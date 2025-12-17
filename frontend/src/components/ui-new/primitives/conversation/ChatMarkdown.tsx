import WYSIWYGEditor from '@/components/ui/wysiwyg';
import { cn } from '@/lib/utils';

interface ChatMarkdownProps {
  content: string;
  maxWidth?: string;
  className?: string;
  taskAttemptId?: string;
}

export function ChatMarkdown({
  content,
  maxWidth = '800px',
  className,
  taskAttemptId,
}: ChatMarkdownProps) {
  return (
    <div className={cn('text-sm text-normal', className)} style={{ maxWidth }}>
      <WYSIWYGEditor
        value={content}
        disabled
        className="whitespace-pre-wrap break-words"
        taskAttemptId={taskAttemptId}
      />
    </div>
  );
}
