import { TerminalIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ToolStatus } from 'shared/types';
import { ToolStatusDot } from './ToolStatusDot';
import { ScriptLogsDialog } from '@/components/dialogs/ScriptLogsDialog';

interface ChatScriptEntryProps {
  title: string;
  processId: string;
  exitCode?: number | null;
  className?: string;
  status: ToolStatus;
}

export function ChatScriptEntry({
  title,
  processId,
  exitCode,
  className,
  status,
}: ChatScriptEntryProps) {
  const isRunning = status.status === 'created';
  const isSuccess = status.status === 'success';
  const isFailed = status.status === 'failed';

  const handleClick = () => {
    ScriptLogsDialog.show({ processId, title });
  };

  const getSubtitle = () => {
    if (isRunning) {
      return 'Running...';
    }
    if (isFailed && exitCode !== null && exitCode !== undefined) {
      return `Exit code: ${exitCode}`;
    }
    if (isSuccess) {
      return 'Completed successfully';
    }
    return 'Click to view logs';
  };

  return (
    <div
      className={cn(
        'flex items-start gap-base text-sm cursor-pointer hover:bg-secondary/50 rounded-md -mx-half px-half py-half transition-colors',
        className
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <span className="relative shrink-0 mt-0.5">
        <TerminalIcon className="size-icon-base text-low" />
        <ToolStatusDot
          status={status}
          className="absolute -bottom-0.5 -left-0.5"
        />
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-normal font-medium">{title}</span>
        <span className="text-low text-xs">{getSubtitle()}</span>
      </div>
    </div>
  );
}
