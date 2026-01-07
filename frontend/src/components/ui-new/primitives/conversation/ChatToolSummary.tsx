import {
  ListMagnifyingGlassIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ToolStatus } from 'shared/types';
import { ToolStatusDot } from './ToolStatusDot';

interface ChatToolSummaryProps {
  summary: string;
  className?: string;
  expanded?: boolean;
  onToggle?: () => void;
  status?: ToolStatus;
  onViewContent?: () => void;
  toolName?: string;
}

export function ChatToolSummary({
  summary,
  className,
  expanded,
  onToggle,
  status,
  onViewContent,
  toolName,
}: ChatToolSummaryProps) {
  const handleClick = () => {
    if (onViewContent) {
      onViewContent();
    } else if (onToggle) {
      onToggle();
    }
  };

  const Icon =
    toolName === 'Bash' ? TerminalWindowIcon : ListMagnifyingGlassIcon;

  return (
    <div
      className={cn(
        'flex items-start gap-base text-sm text-low cursor-pointer',
        className
      )}
      onClick={handleClick}
      role="button"
    >
      <span className="relative shrink-0 mt-0.5">
        <Icon className="size-icon-base" />
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
