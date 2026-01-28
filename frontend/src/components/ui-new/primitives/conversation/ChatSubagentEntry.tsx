import { useMemo } from 'react';
import {
  CaretDownIcon,
  RobotIcon,
  CheckCircleIcon,
  XCircleIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ToolStatus, ToolResult } from 'shared/types';
import { ChatMarkdown } from './ChatMarkdown';

interface ChatSubagentEntryProps {
  description: string;
  subagentType?: string | null;
  result?: ToolResult | null;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  status?: ToolStatus;
  workspaceId?: string;
}

/**
 * Renders a collapsible subagent (Task tool) entry showing:
 * - Header with subagent type and description
 * - Expandable content showing the subagent's output/conversation
 */
export function ChatSubagentEntry({
  description,
  subagentType,
  result,
  expanded = false,
  onToggle,
  className,
  status,
  workspaceId,
}: ChatSubagentEntryProps) {
  // Determine status icon
  const StatusIcon = useMemo(() => {
    if (!status) return null;
    switch (status.status) {
      case 'success':
        return (
          <CheckCircleIcon className="size-icon-xs text-success" weight="fill" />
        );
      case 'failed':
        return <XCircleIcon className="size-icon-xs text-error" weight="fill" />;
      case 'created':
        return (
          <CircleNotchIcon className="size-icon-xs text-low animate-spin" />
        );
      default:
        return null;
    }
  }, [status]);

  // Format the subagent type for display
  const formattedType = useMemo(() => {
    if (!subagentType) return 'Subagent';
    // Capitalize first letter and format
    return subagentType.charAt(0).toUpperCase() + subagentType.slice(1);
  }, [subagentType]);

  // Extract the result content for display
  const resultContent = useMemo(() => {
    if (!result?.value) return null;

    // Handle both string and object values
    if (typeof result.value === 'string') {
      return result.value;
    }

    // For JSON results, stringify with formatting
    return JSON.stringify(result.value, null, 2);
  }, [result]);

  // Determine if we have content to show
  const hasContent = Boolean(resultContent);

  return (
    <div
      className={cn(
        'rounded-sm border overflow-hidden',
        status?.status === 'failed' && 'border-error bg-error/5',
        status?.status === 'success' && 'border-success/50',
        !status || status.status === 'created' ? 'border-border' : '',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center px-double py-base gap-base',
          status?.status === 'failed' && 'bg-error/10',
          status?.status === 'success' && 'bg-success/5',
          onToggle && hasContent && 'cursor-pointer'
        )}
        onClick={hasContent ? onToggle : undefined}
      >
        <span className="relative shrink-0">
          <RobotIcon className="size-icon-base text-low" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-base">
            <span className="text-xs font-medium text-low uppercase tracking-wide">
              {formattedType}
            </span>
            {StatusIcon}
          </div>
          <span className="text-sm text-normal truncate block">
            {description}
          </span>
        </div>
        {onToggle && hasContent && (
          <CaretDownIcon
            className={cn(
              'size-icon-xs shrink-0 text-low transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Expanded content - shows subagent output */}
      {expanded && hasContent && (
        <div className="border-t p-double bg-panel/50">
          <div className="text-xs font-medium text-low mb-base uppercase tracking-wide">
            Output
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ChatMarkdown content={resultContent!} workspaceId={workspaceId} />
          </div>
        </div>
      )}
    </div>
  );
}
