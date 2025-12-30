import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ChatToolSummaryProps {
  summary: string;
  className?: string;
  expanded?: boolean;
  onToggle?: () => void;
}

export function ChatToolSummary({
  summary,
  className,
  expanded,
  onToggle,
}: ChatToolSummaryProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-base text-sm text-low cursor-pointer',
        className
      )}
      onClick={onToggle}
      role="button"
    >
      <ListMagnifyingGlassIcon className="shrink-0 size-icon-base mt-0.5" />
      <span
        className={cn(
          !expanded && 'truncate',
          expanded && 'whitespace-pre-wrap break-all'
        )}
      >
        {summary}
      </span>
    </div>
  );
}
