import {
  UserRound,
  Cog,
  Play,
  Terminal,
  ChevronDown,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ProcessStartPayload } from '@/types/logs';
import type { ExecutorAction } from 'shared/types';
import { PROCESS_RUN_REASONS } from '@/constants/processes';

interface ProcessStartCardProps {
  payload: ProcessStartPayload;
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
  onRestore?: (processId: string) => void;
  restoreProcessId?: string; // explicit id if payload lacks it in future
  restoreDisabled?: boolean;
  restoreDisabledReason?: string;
}

const extractPromptFromAction = (
  action?: ExecutorAction | null
): string | null => {
  if (!action) return null;
  const t = action.typ as any;
  if (t && typeof t.prompt === 'string' && t.prompt.trim()) return t.prompt;
  return null;
};

function ProcessStartCard({
  payload,
  isCollapsed,
  onToggle,
  onRestore,
  restoreProcessId,
  restoreDisabled,
  restoreDisabledReason,
}: ProcessStartCardProps) {
  const getProcessIcon = (runReason: string) => {
    switch (runReason) {
      case PROCESS_RUN_REASONS.SETUP_SCRIPT:
        return <Cog className="h-4 w-4" />;
      case PROCESS_RUN_REASONS.CLEANUP_SCRIPT:
        return <Terminal className="h-4 w-4" />;
      case PROCESS_RUN_REASONS.CODING_AGENT:
        return <UserRound className="h-4 w-4" />;
      case PROCESS_RUN_REASONS.DEV_SERVER:
        return <Play className="h-4 w-4" />;
      default:
        return <Cog className="h-4 w-4" />;
    }
  };

  const getProcessLabel = (p: ProcessStartPayload) => {
    if (p.runReason === PROCESS_RUN_REASONS.CODING_AGENT) {
      const prompt = extractPromptFromAction(p.action);
      return prompt || 'Coding Agent';
    }
    switch (p.runReason) {
      case PROCESS_RUN_REASONS.SETUP_SCRIPT:
        return 'Setup Script';
      case PROCESS_RUN_REASONS.CLEANUP_SCRIPT:
        return 'Cleanup Script';
      case PROCESS_RUN_REASONS.DEV_SERVER:
        return 'Dev Server';
      default:
        return p.runReason;
    }
  };

  const handleClick = () => {
    onToggle(payload.processId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(payload.processId);
    }
  };

  const label = getProcessLabel(payload);
  const shouldTruncate =
    isCollapsed && payload.runReason === PROCESS_RUN_REASONS.CODING_AGENT;

  return (
    <div className="pl-16 pb-2 w-full">
      <div
        className="px-3 p-2 cursor-pointer select-none transition-colors border rounded-md w-full bg-zinc-100 dark:bg-zinc-800"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-foreground min-w-0 flex-1">
            <div className="flex-shrink-0">
              {getProcessIcon(payload.runReason)}
            </div>
            <span
              className={cn(
                'font-medium',
                shouldTruncate ? 'truncate' : 'whitespace-normal break-words'
              )}
              title={shouldTruncate ? label : undefined}
            >
              {label}
            </span>
          </div>
          {onRestore &&
            payload.runReason === PROCESS_RUN_REASONS.CODING_AGENT && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'ml-2 p-1 rounded transition-colors',
                        restoreDisabled
                          ? 'cursor-not-allowed text-muted-foreground/60'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (restoreDisabled) return;
                        onRestore(restoreProcessId || payload.processId);
                      }}
                      aria-label="Restore to this checkpoint"
                      disabled={!!restoreDisabled}
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {restoreDisabled
                      ? restoreDisabledReason ||
                        'Restore is currently unavailable.'
                      : 'Restore'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

          <div
            className={cn(
              'ml-auto text-xs px-2 py-1 rounded-full',
              payload.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : payload.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : payload.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
            )}
          >
            {payload.status}
          </div>

          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isCollapsed && '-rotate-90'
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default ProcessStartCard;
