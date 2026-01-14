import { forwardRef } from 'react';
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
  isTruncated?: boolean;
}

export const ChatToolSummary = forwardRef<
  HTMLSpanElement,
  ChatToolSummaryProps
>(function ChatToolSummary(
  {
    summary,
    className,
    expanded,
    onToggle,
    status,
    onViewContent,
    toolName,
    isTruncated,
  },
  ref
) {
  // Can expand if text is truncated and onToggle is provided
  const canExpand = isTruncated && onToggle;
  const isClickable = Boolean(onViewContent || canExpand);

  const handleClick = () => {
    if (onViewContent) {
      onViewContent();
    } else if (canExpand) {
      onToggle();
    }
  };

  const Icon =
    toolName === 'Bash' ? TerminalWindowIcon : ListMagnifyingGlassIcon;

  return (
    <div
      className={cn(
        'flex items-start gap-base text-sm text-low',
        isClickable && 'cursor-pointer',
        className
      )}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
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
        ref={ref}
        className={cn(
          !expanded && 'truncate',
          expanded && 'whitespace-pre-wrap break-all'
        )}
      >
        {summary}
      </span>
    </div>
  );
});
