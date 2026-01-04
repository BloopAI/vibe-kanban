import { ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ToolStatus } from 'shared/types';
import { ToolStatusDot } from './ToolStatusDot';

interface ChatToolSummaryProps {
  summary: string;
  className?: string;
  expanded?: boolean;
  onToggle?: () => void;
  status?: ToolStatus;
}

export function ChatToolSummary({
  summary,
  className,
  expanded,
  onToggle,
  status,
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
      <span className="relative shrink-0 mt-0.5">
        <ListMagnifyingGlassIcon className="size-icon-base" />
        {status && (
          <ToolStatusDot
            status={status}
            className="absolute -bottom-0.5 -left-0.5"
          />
        )}
      </span>
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
